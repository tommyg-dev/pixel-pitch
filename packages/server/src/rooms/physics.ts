import { FIELD, PLAYER, BALL, clamp } from "@pixel-pitch/shared";
import type { MatchState, PlayerState } from "./schema.js";

const LEFT = FIELD.MARGIN;
const RIGHT = FIELD.WIDTH - FIELD.MARGIN;
const TOP = FIELD.MARGIN;
const BOTTOM = FIELD.HEIGHT - FIELD.MARGIN;
const GOAL_TOP = FIELD.HEIGHT / 2 - FIELD.GOAL_HEIGHT / 2;
const GOAL_BOTTOM = FIELD.HEIGHT / 2 + FIELD.GOAL_HEIGHT / 2;

export type GoalEvent = "blue" | "orange" | null;

/** Spawn positions: blue on the left half, orange on the right, kicked off from center. */
export function resetPositions(state: MatchState) {
  const blue: PlayerState[] = [];
  const orange: PlayerState[] = [];
  state.players.forEach((p) => (p.team === "blue" ? blue : orange).push(p));

  const place = (arr: PlayerState[], teamLeft: boolean) => {
    const baseX = teamLeft ? FIELD.WIDTH * 0.3 : FIELD.WIDTH * 0.7;
    arr.forEach((p, i) => {
      p.x = baseX;
      // Evenly distribute vertically (1 player -> centre, 3 players -> thirds).
      p.y = FIELD.HEIGHT * ((i + 1) / (arr.length + 1));
      p.vx = 0;
      p.vy = 0;
    });
  };
  place(blue, true);
  place(orange, false);

  state.ball.x = FIELD.WIDTH / 2;
  state.ball.y = FIELD.HEIGHT / 2;
  state.ball.vx = 0;
  state.ball.vy = 0;
}

export function step(state: MatchState, dt: number): GoalEvent {
  // --- players ---
  state.players.forEach((p) => {
    if (!p.connected) return;
    const mag = Math.hypot(p.inputDx, p.inputDy);
    if (mag > 0.001) {
      const nx = p.inputDx / mag;
      const ny = p.inputDy / mag;
      p.vx += nx * PLAYER.ACCEL * dt;
      p.vy += ny * PLAYER.ACCEL * dt;
    }
    p.vx *= PLAYER.FRICTION;
    p.vy *= PLAYER.FRICTION;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > PLAYER.MAX_SPEED) {
      p.vx = (p.vx / speed) * PLAYER.MAX_SPEED;
      p.vy = (p.vy / speed) * PLAYER.MAX_SPEED;
    }
    p.x = clamp(p.x + p.vx * dt, LEFT + PLAYER.RADIUS, RIGHT - PLAYER.RADIUS);
    p.y = clamp(p.y + p.vy * dt, TOP + PLAYER.RADIUS, BOTTOM - PLAYER.RADIUS);
  });

  // --- player-player separation (simple) ---
  const list: PlayerState[] = [];
  state.players.forEach((p) => list.push(p));
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      separate(list[i], list[j], PLAYER.RADIUS * 2);
    }
  }

  // --- ball vs players (kick / dribble) ---
  const ball = state.ball;
  state.players.forEach((p) => {
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    const min = PLAYER.RADIUS + BALL.RADIUS;
    if (dist < min && dist > 0.0001) {
      const nx = dx / dist;
      const ny = dy / dist;
      // push ball out of the player body
      ball.x = p.x + nx * min;
      ball.y = p.y + ny * min;
      // transfer player momentum, plus a burst on kick
      const force = p.inputKick ? BALL.KICK_FORCE : 60;
      ball.vx += nx * force + p.vx * 0.6;
      ball.vy += ny * force + p.vy * 0.6;
      state.lastTouchSessionId = p.sessionId;
    }
  });

  // --- ball integration ---
  ball.vx *= BALL.FRICTION;
  ball.vy *= BALL.FRICTION;
  const bspeed = Math.hypot(ball.vx, ball.vy);
  if (bspeed > BALL.MAX_SPEED) {
    ball.vx = (ball.vx / bspeed) * BALL.MAX_SPEED;
    ball.vy = (ball.vy / bspeed) * BALL.MAX_SPEED;
  }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // top/bottom walls
  if (ball.y < TOP + BALL.RADIUS) {
    ball.y = TOP + BALL.RADIUS;
    ball.vy = Math.abs(ball.vy) * 0.7;
  } else if (ball.y > BOTTOM - BALL.RADIUS) {
    ball.y = BOTTOM - BALL.RADIUS;
    ball.vy = -Math.abs(ball.vy) * 0.7;
  }

  // left/right walls + goal detection
  const inGoalY = ball.y > GOAL_TOP && ball.y < GOAL_BOTTOM;
  if (ball.x < LEFT + BALL.RADIUS) {
    if (inGoalY) return "orange"; // ball entered left goal -> orange scores
    ball.x = LEFT + BALL.RADIUS;
    ball.vx = Math.abs(ball.vx) * 0.7;
  } else if (ball.x > RIGHT - BALL.RADIUS) {
    if (inGoalY) return "blue"; // ball entered right goal -> blue scores
    ball.x = RIGHT - BALL.RADIUS;
    ball.vx = -Math.abs(ball.vx) * 0.7;
  }

  return null;
}

function separate(a: PlayerState, b: PlayerState, minDist: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d > 0.0001 && d < minDist) {
    const overlap = (minDist - d) / 2;
    const nx = dx / d;
    const ny = dy / d;
    a.x -= nx * overlap;
    a.y -= ny * overlap;
    b.x += nx * overlap;
    b.y += ny * overlap;
  }
}
