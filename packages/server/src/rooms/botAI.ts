import { FIELD, PLAYER, BALL } from "@pixel-pitch/shared";
import type { MatchState, PlayerState } from "./schema.js";

const LEFT = FIELD.MARGIN;
const RIGHT = FIELD.WIDTH - FIELD.MARGIN;

/**
 * Lightweight per-team AI: the bot nearest the ball chases & kicks toward the
 * opponent goal; teammates hold a supporting position between ball and own goal.
 * Runs once per simulation frame, writing inputDx/inputDy/inputKick on bots.
 */
export function updateBots(state: MatchState) {
  const ball = state.ball;
  for (const team of ["blue", "orange"] as const) {
    const bots: PlayerState[] = [];
    state.players.forEach((p) => { if (p.isBot && p.team === team) bots.push(p); });
    if (!bots.length) continue;

    // attacking direction: blue -> right goal, orange -> left goal
    const oppGoalX = team === "blue" ? RIGHT : LEFT;
    const ownGoalX = team === "blue" ? LEFT : RIGHT;

    bots.sort((a, b) => dist2(a, ball) - dist2(b, ball));
    const chaser = bots[0];

    bots.forEach((bot, i) => {
      if (bot === chaser) {
        // Approach so the kick sends the ball toward the opponent goal, with a
        // little jitter so two opposing chasers don't deadlock head-on.
        const towardOpp = Math.sign(oppGoalX - ownGoalX);
        const behindX = ball.x - towardOpp * (PLAYER.RADIUS + BALL.RADIUS) * 1.1;
        const jitter = (Math.random() - 0.5) * 70;
        const d = Math.hypot(ball.x - bot.x, ball.y - bot.y);
        const tx = d < 70 ? ball.x + towardOpp * 30 : behindX;
        steer(bot, tx, ball.y + jitter);
        bot.inputKick = d < PLAYER.RADIUS + BALL.RADIUS + 12;
      } else {
        // Supporter: hold position in own half between ball and goal, fanned out.
        const targetX = ownGoalX * 0.55 + ball.x * 0.45;
        const spread = (i - bots.length / 2) * 150;
        const targetY = clampY(ball.y + spread);
        steer(bot, targetX, targetY);
        bot.inputKick = false;
      }
    });
  }
}

function steer(bot: PlayerState, tx: number, ty: number) {
  const dx = tx - bot.x;
  const dy = ty - bot.y;
  const m = Math.hypot(dx, dy);
  if (m < 4) { bot.inputDx = 0; bot.inputDy = 0; return; }
  bot.inputDx = dx / m;
  bot.inputDy = dy / m;
}

function dist2(p: PlayerState, b: { x: number; y: number }) {
  const dx = p.x - b.x, dy = p.y - b.y;
  return dx * dx + dy * dy;
}

function clampY(y: number) {
  const top = FIELD.MARGIN + 40, bot = FIELD.HEIGHT - FIELD.MARGIN - 40;
  return y < top ? top : y > bot ? bot : y;
}
