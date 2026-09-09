export type InteractionState =
  | 'no-face'
  | 'neutral'
  | 'smile-entering'
  | 'smiling'
  | 'laugh-entering'
  | 'laughing'
  | 'celebrating'
  | 'cooldown';

export type InteractionInput = {
  smile: number;
  jawOpen: number;
  valid: boolean;
};

export type StateMachineSettings = {
  smileEnter: number;
  smileExit: number;
  laughSmileEnter: number;
  laughJawEnter: number;
  laughStrongJawEnter: number;
  laughMediumSmileEnter: number;
  laughStrongSmileEnter: number;
  laughMediumJawEnter: number;
  laughSmileExit: number;
  laughJawExit: number;
  smileEnterMs: number;
  smileAwakenMs: number;
  smileExitMs: number;
  laughEnterMs: number;
  laughBreathMs: number;
  laughConfirmMs: number;
  celebrationMs: number;
  cooldownMs: number;
  rearmMs: number;
};

export type LaughPath = 'balanced' | 'jaw-led' | 'smile-led' | null;

export type InteractionDiagnostics = {
  laughPath: LaughPath;
  laughSignalScore: number;
  laughCandidateProgress: number;
  smileCandidateProgress: number;
  expressionEnergy: number;
  blocker: string;
  cooldownRemainingMs: number;
};

export type StateTransition = {
  from: InteractionState;
  to: InteractionState;
  reason: string;
  timestampMs: number;
};

export const DEFAULT_STATE_MACHINE_SETTINGS: StateMachineSettings = {
  smileEnter: 0.34,
  smileExit: 0.19,
  laughSmileEnter: 0.42,
  laughJawEnter: 0.3,
  laughStrongJawEnter: 0.52,
  laughMediumSmileEnter: 0.24,
  laughStrongSmileEnter: 0.7,
  laughMediumJawEnter: 0.18,
  laughSmileExit: 0.26,
  laughJawExit: 0.2,
  smileEnterMs: 220,
  smileAwakenMs: 480,
  smileExitMs: 340,
  laughEnterMs: 320,
  laughBreathMs: 260,
  laughConfirmMs: 80,
  celebrationMs: 1600,
  cooldownMs: 1500,
  rearmMs: 320,
};

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export class ExpressionStateMachine {
  private readonly settings: StateMachineSettings;
  private state: InteractionState = 'no-face';
  private stateSinceMs = 0;
  private lastUpdateMs = 0;
  private expressionEnergy = 0;
  private smileCandidateSince: number | null = null;
  private laughCandidateSince: number | null = null;
  private exitCandidateSince: number | null = null;
  private rearmCandidateSince: number | null = null;

  constructor(settings = DEFAULT_STATE_MACHINE_SETTINGS) {
    this.settings = settings;
  }

  getState() {
    return this.state;
  }

  reset(timestampMs = 0) {
    this.state = 'no-face';
    this.stateSinceMs = timestampMs;
    this.lastUpdateMs = timestampMs;
    this.expressionEnergy = 0;
    this.clearCandidates();
  }

  update(input: InteractionInput, timestampMs: number): StateTransition | null {
    this.updateEnergy(input, timestampMs);
    if (!input.valid) {
      this.clearCandidates();
      return this.state === 'no-face'
        ? null
        : this.transition('no-face', '人脸信号离开，清空候选状态', timestampMs);
    }
    if (this.state === 'no-face') {
      return this.transition('neutral', '有效人脸信号恢复', timestampMs);
    }

    const smileEntered = input.smile >= this.settings.smileEnter;
    const smileExited = input.smile <= this.settings.smileExit;
    const laughPath = this.getLaughPath(input.smile, input.jawOpen);

    switch (this.state) {
      case 'neutral':
        if (this.updateLaughCandidate(laughPath, timestampMs)) {
          return this.transition(
            'laugh-entering',
            '大笑条件稳定，开始聚能',
            timestampMs,
          );
        }
        if (smileEntered) {
          this.smileCandidateSince ??= timestampMs;
          if (
            timestampMs - this.smileCandidateSince >=
            this.settings.smileEnterMs
          ) {
            return this.transition(
              'smile-entering',
              '稳定微笑点亮嘴角星芒',
              timestampMs,
            );
          }
        } else {
          this.smileCandidateSince = null;
        }
        break;

      case 'smile-entering':
      case 'smiling':
        if (this.updateLaughCandidate(laughPath, timestampMs)) {
          return this.transition(
            'laugh-entering',
            '快乐积累达到大笑条件',
            timestampMs,
          );
        }
        if (smileExited) {
          this.exitCandidateSince ??= timestampMs;
          if (
            timestampMs - this.exitCandidateSince >=
            this.settings.smileExitMs
          ) {
            return this.transition('neutral', '笑容平滑回落', timestampMs);
          }
        } else {
          this.exitCandidateSince = null;
        }
        if (
          this.state === 'smile-entering' &&
          timestampMs - this.stateSinceMs >= this.settings.smileAwakenMs
        ) {
          return this.transition(
            'smiling',
            '嘴角光丝完成，全息花瓣展开',
            timestampMs,
          );
        }
        break;

      case 'laugh-entering':
        if (!laughPath) {
          return this.transition(
            input.smile > this.settings.smileExit ? 'smiling' : 'neutral',
            '大笑信号未保持，取消聚能',
            timestampMs,
          );
        }
        if (timestampMs - this.stateSinceMs >= this.settings.laughBreathMs) {
          return this.transition('laughing', '快乐能量完成聚拢', timestampMs);
        }
        break;

      case 'laughing':
        if (timestampMs - this.stateSinceMs >= this.settings.laughConfirmMs) {
          return this.transition(
            'celebrating',
            '大笑确认，快乐超载',
            timestampMs,
          );
        }
        break;

      case 'celebrating':
        if (timestampMs - this.stateSinceMs >= this.settings.celebrationMs) {
          return this.transition(
            'cooldown',
            '彩色纸屑进入余韵与冷却',
            timestampMs,
          );
        }
        break;

      case 'cooldown': {
        const cooldownComplete =
          timestampMs - this.stateSinceMs >= this.settings.cooldownMs;
        const laughReleased =
          !laughPath && input.jawOpen <= this.settings.laughJawExit;
        if (cooldownComplete && laughReleased) {
          this.rearmCandidateSince ??= timestampMs;
          if (timestampMs - this.rearmCandidateSince >= this.settings.rearmMs) {
            return this.transition(
              input.smile > this.settings.smileExit ? 'smiling' : 'neutral',
              input.smile > this.settings.smileExit
                ? '大笑回落为微笑，保留脸部花瓣'
                : '表情回落，下一次绽放已就绪',
              timestampMs,
            );
          }
        } else {
          this.rearmCandidateSince = null;
        }
        break;
      }
    }
    return null;
  }

  getDiagnostics(
    input: InteractionInput,
    timestampMs: number,
  ): InteractionDiagnostics {
    const smile = input.valid ? input.smile : 0;
    const jawOpen = input.valid ? input.jawOpen : 0;
    const laughPath = input.valid ? this.getLaughPath(smile, jawOpen) : null;
    const laughSignalScore = input.valid
      ? this.getLaughSignalScore(smile, jawOpen)
      : 0;
    const laughExited = !laughPath && jawOpen <= this.settings.laughJawExit;
    const cooldownRemainingMs =
      this.state === 'cooldown'
        ? Math.max(
            0,
            this.settings.cooldownMs - (timestampMs - this.stateSinceMs),
          )
        : 0;
    const smileCandidateProgress = this.smileCandidateSince
      ? clamp(
          (timestampMs - this.smileCandidateSince) / this.settings.smileEnterMs,
        )
      : this.state === 'smile-entering' || this.state === 'smiling'
        ? 1
        : 0;
    const laughCandidateProgress = this.laughCandidateSince
      ? clamp(
          (timestampMs - this.laughCandidateSince) / this.settings.laughEnterMs,
        )
      : ['laugh-entering', 'laughing', 'celebrating'].includes(this.state)
        ? 1
        : 0;

    let blocker = '笑一下，点亮情绪';
    if (!input.valid) blocker = '回到镜头前，让光找到你';
    else if (this.state === 'smile-entering') blocker = '嘴角发光了';
    else if (this.state === 'smiling') blocker = '再开心一点';
    else if (this.state === 'laugh-entering' || this.state === 'laughing')
      blocker = '快乐能量正在过载';
    else if (this.state === 'celebrating') blocker = '快乐超载！';
    else if (this.state === 'cooldown')
      blocker =
        cooldownRemainingMs > 0
          ? '动一动，撞开花瓣'
          : laughExited
            ? '余韵正在落下'
            : '放松笑容，准备下一次盛放';
    else if (laughPath) blocker = '大笑信号已匹配，请短暂保持';
    else if (jawOpen >= this.settings.laughStrongJawEnter)
      blocker = '张嘴幅度足够，再增加一点笑意';
    else if (smile >= this.settings.smileEnter) blocker = '再开心一点';

    return {
      laughPath,
      laughSignalScore,
      laughCandidateProgress,
      smileCandidateProgress,
      expressionEnergy: this.expressionEnergy,
      blocker,
      cooldownRemainingMs,
    };
  }

  private updateEnergy(input: InteractionInput, timestampMs: number) {
    const deltaMs = this.lastUpdateMs
      ? Math.min(120, Math.max(0, timestampMs - this.lastUpdateMs))
      : 50;
    this.lastUpdateMs = timestampMs;
    const target = input.valid
      ? clamp(input.smile * 0.84 + Math.min(input.smile, input.jawOpen) * 0.16)
      : 0;
    const timeConstant =
      target > this.expressionEnergy ? 280 : input.valid ? 620 : 180;
    const alpha = 1 - Math.exp(-deltaMs / timeConstant);
    this.expressionEnergy += (target - this.expressionEnergy) * alpha;
    if (!input.valid && this.expressionEnergy < 0.004)
      this.expressionEnergy = 0;
  }

  private updateLaughCandidate(path: LaughPath, timestampMs: number) {
    if (!path) {
      this.laughCandidateSince = null;
      return false;
    }
    this.laughCandidateSince ??= timestampMs;
    return timestampMs - this.laughCandidateSince >= this.settings.laughEnterMs;
  }

  private transition(
    to: InteractionState,
    reason: string,
    timestampMs: number,
  ): StateTransition {
    const from = this.state;
    this.state = to;
    this.stateSinceMs = timestampMs;
    this.clearCandidates();
    return { from, to, reason, timestampMs };
  }

  private getLaughPath(
    smile: number,
    jawOpen: number,
  ): Exclude<LaughPath, null> | null {
    if (
      jawOpen >= this.settings.laughStrongJawEnter &&
      smile >= this.settings.laughMediumSmileEnter
    )
      return 'jaw-led';
    if (
      smile >= this.settings.laughStrongSmileEnter &&
      jawOpen >= this.settings.laughMediumJawEnter
    )
      return 'smile-led';
    if (
      smile >= this.settings.laughSmileEnter &&
      jawOpen >= this.settings.laughJawEnter
    )
      return 'balanced';
    return null;
  }

  private getLaughSignalScore(smile: number, jawOpen: number) {
    const ratio = (value: number, threshold: number) =>
      clamp(value / threshold);
    return Math.max(
      Math.min(
        ratio(jawOpen, this.settings.laughStrongJawEnter),
        ratio(smile, this.settings.laughMediumSmileEnter),
      ),
      Math.min(
        ratio(smile, this.settings.laughStrongSmileEnter),
        ratio(jawOpen, this.settings.laughMediumJawEnter),
      ),
      Math.min(
        ratio(smile, this.settings.laughSmileEnter),
        ratio(jawOpen, this.settings.laughJawEnter),
      ),
    );
  }

  private clearCandidates() {
    this.smileCandidateSince = null;
    this.laughCandidateSince = null;
    this.exitCandidateSince = null;
    this.rearmCandidateSince = null;
  }
}
