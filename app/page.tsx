'use client';

import { useState } from 'react';
import { useCamera } from '@/camera/use-camera';
import { useFaceLandmarker } from '@/face/use-face-landmarker';
import {
  DEFAULT_EXPRESSION_SETTINGS,
  type ExpressionSettings,
} from '@/face/expression-signal';
import {
  useInteractionState,
  type SimulationMode,
} from '@/interaction/use-interaction-state';
import { DEFAULT_STATE_MACHINE_SETTINGS } from '@/interaction/expression-state-machine';
import { useVisualEffects } from '@/effects/use-visual-effects';

const statusCopy = {
  idle: '等待开始',
  requesting: '正在请求权限',
  active: '摄像头已连接',
  error: '需要处理',
} as const;

const faceStatusCopy = {
  idle: '等待摄像头',
  loading: '正在加载模型',
  ready: '模型已就绪',
  running: '正在识别',
  error: '模型异常',
} as const;

const interactionStateCopy = {
  'no-face': { label: 'NO FACE', detail: '等待你回到镜头' },
  neutral: { label: 'NEUTRAL', detail: '极光正在呼吸' },
  'smile-entering': { label: 'AWAKENING', detail: '嘴角星芒正在点亮' },
  smiling: { label: 'SMILING', detail: '全息花瓣轻轻呼吸' },
  'laugh-entering': { label: 'CHARGING', detail: '快乐能量正在过载' },
  laughing: { label: 'LAUGHING', detail: '准备绽放' },
  celebrating: { label: 'OVERLOAD', detail: '快乐超载了' },
  cooldown: { label: 'AFTERGLOW', detail: '彩色余韵缓缓落下' },
} as const;

const simulationCopy: Record<SimulationMode, string> = {
  live: '实时',
  neutral: '中性',
  smile: '微笑',
  laugh: '大笑',
};

export default function Home() {
  const [debugOpen, setDebugOpen] = useState(false);
  const [expressionSettings, setExpressionSettings] =
    useState<ExpressionSettings>(DEFAULT_EXPRESSION_SETTINGS);
  const {
    videoRef,
    status,
    error,
    videoSize,
    startCamera,
    stopCamera,
    updateVideoSize,
  } = useCamera();
  const isActive = status === 'active';
  const isRequesting = status === 'requesting';
  const {
    canvasRef: faceCanvasRef,
    status: faceStatus,
    metrics: faceMetrics,
    error: faceError,
    recalibrate,
  } = useFaceLandmarker(videoRef, isActive, expressionSettings);
  const calibration = faceMetrics.signal.calibration;
  const calibrationInstruction =
    calibration.status === 'neutral'
      ? calibration.neutralSampleAccepted
        ? '请放松表情，正在记录自然状态'
        : '请自然闭嘴并放松笑容'
      : calibration.status === 'smile-prompt'
        ? '请自然微笑一次'
        : calibration.status === 'smile-capturing'
          ? '很好，请保持微笑片刻'
          : calibration.status === 'jaw-prompt'
            ? '接下来请自然张大嘴一次'
            : calibration.status === 'jaw-capturing'
              ? '很好，请保持张嘴片刻'
              : calibration.status === 'ready'
                ? '个体表情模型已就绪'
                : '检测到人脸后开始个体校准';
  const {
    state: interactionState,
    simulationMode,
    setSimulationMode,
    transitions,
    clearTransitions,
    effectiveInput,
    diagnostics: interactionDiagnostics,
  } = useInteractionState({
    smile: faceMetrics.signal.normalized.smile,
    jawOpen: faceMetrics.signal.normalized.jawOpen,
    valid:
      faceMetrics.hasFace &&
      faceMetrics.signal.accepted &&
      calibration.status === 'ready',
  });
  const {
    hostRef: effectsHostRef,
    status: effectsStatus,
    metrics: effectsMetrics,
    error: effectsError,
  } = useVisualEffects(
    interactionState,
    interactionDiagnostics.expressionEnergy,
    transitions[0],
    faceMetrics.headCollider,
  );
  const facePipelineStatus =
    faceStatus === 'running' && calibration.status !== 'ready'
      ? `个体校准 ${Math.round(calibration.progress * 100)}%`
      : faceStatus === 'running' && calibration.status === 'ready'
        ? '信号已标准化'
        : faceStatusCopy[faceStatus];
  const laughBlocker =
    simulationMode !== 'live'
      ? interactionDiagnostics.blocker
      : !isActive
        ? '请先启动摄像头'
        : !faceMetrics.hasFace
          ? '未检测到人脸，请将脸移入框内'
          : calibration.status !== 'ready'
            ? calibrationInstruction
            : !faceMetrics.signal.accepted
              ? '人脸质量不足：请正对镜头并靠近一些'
              : interactionDiagnostics.blocker;
  const springCue =
    interactionState === 'no-face'
      ? '回到镜头前，让光找到你'
      : interactionState === 'neutral'
        ? '笑一下，点亮情绪'
        : interactionState === 'smile-entering'
          ? '嘴角发光了'
          : interactionState === 'smiling'
            ? interactionDiagnostics.expressionEnergy > 0.64
              ? '再开心一点，让快乐升级'
              : '全息花瓣正在生长'
            : interactionState === 'laugh-entering' ||
                interactionState === 'laughing'
              ? '快乐能量正在过载'
              : interactionState === 'celebrating'
                ? '快乐超载！'
                : '余韵正在落下';

  function updateExpressionSetting(
    key: keyof ExpressionSettings,
    value: number,
  ) {
    setExpressionSettings((current) => ({ ...current, [key]: value }));
  }

  const pipelineItems = [
    { label: '摄像头', value: statusCopy[status], active: isActive },
    {
      label: '表情识别',
      value: facePipelineStatus,
      active: calibration.status === 'ready',
    },
    {
      label: '互动状态',
      value: interactionStateCopy[interactionState].label,
      active: !['no-face', 'neutral'].includes(interactionState),
    },
    {
      label: '粒子引擎',
      value:
        effectsStatus === 'ready'
          ? ['smile-entering', 'smiling'].includes(interactionState)
            ? 'FACE BLOOM'
            : interactionState === 'celebrating'
              ? 'FLOWER BLOOM'
              : 'PixiJS 已就绪'
          : effectsStatus === 'error'
            ? '初始化失败'
            : '正在初始化',
      active: effectsStatus === 'ready',
    },
    {
      label: '头部碰撞',
      value: faceMetrics.headCollider.valid ? '实时跟踪中' : '等待人脸',
      active: faceMetrics.headCollider.valid,
    },
  ];

  return (
    <main
      className={`app-shell camera-${status} interaction-${interactionState} ${faceMetrics.hasFace ? 'has-face' : ''}`}
    >
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#stage" aria-label="Emotion Bloom 主页">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span>SMILE BRINGS SPRING</span>
        </a>
        <output className="status-pill">
          <span className={`status-dot ${status}`} aria-hidden="true" />
          {statusCopy[status]}
        </output>
        <button
          className="icon-button"
          type="button"
          aria-label={debugOpen ? '关闭调试面板' : '打开调试面板'}
          aria-expanded={debugOpen}
          onClick={() => setDebugOpen((current) => !current)}
        >
          <span aria-hidden="true">{debugOpen ? '×' : '•••'}</span>
        </button>
      </header>

      <section className="stage" id="stage" aria-labelledby="stage-title">
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          muted
          playsInline
          aria-label="前置摄像头实时画面"
          onLoadedMetadata={updateVideoSize}
          onResize={updateVideoSize}
        />
        <div
          ref={effectsHostRef}
          className="effects-layer"
          aria-hidden="true"
        />
        <canvas
          ref={faceCanvasRef}
          className={`face-overlay ${debugOpen ? 'is-debug' : ''}`}
          aria-hidden="true"
        />
        <div className="video-shade" aria-hidden="true" />
        <div className="stage-grid" aria-hidden="true" />
        <div className="camera-frame" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
          <div className="face-guide">
            <span className="guide-eye guide-eye-left" />
            <span className="guide-eye guide-eye-right" />
            <span className="guide-smile" />
          </div>
        </div>

        <div className="stage-copy">
          <p className="eyebrow">EMOTION BLOOM</p>
          <h1 id="stage-title">笑容，让情绪绽放</h1>
          <p className="stage-description">微笑嘴角生花，大笑快乐超载</p>
        </div>

        {isActive ? (
          <output className="camera-ready">
            <span
              className={`status-dot ${faceStatus === 'error' ? 'error' : faceStatus === 'running' ? 'active' : 'requesting'}`}
              aria-hidden="true"
            />
            {faceStatus === 'loading'
              ? '正在加载人脸模型…'
              : faceStatus === 'error'
                ? '人脸模型加载失败'
                : !faceMetrics.hasFace
                  ? '回到镜头前，让光找到你'
                  : calibration.status !== 'ready'
                    ? `${calibrationInstruction} · ${Math.round(calibration.progress * 100)}%`
                    : faceMetrics.signal.accepted
                      ? '现在，试着笑一笑'
                      : '请正对镜头并靠近一些'}
          </output>
        ) : null}

        <output className="interaction-state-badge">
          <span className="state-orb" aria-hidden="true" />
          <span>
            <small>
              {simulationMode === 'live'
                ? 'LIVE STATE'
                : `SIMULATION · ${simulationCopy[simulationMode]}`}
            </small>
            <strong>{interactionStateCopy[interactionState].label}</strong>
          </span>
          <i>{interactionStateCopy[interactionState].detail}</i>
        </output>

        {error ? (
          <section className="error-card" aria-labelledby="camera-error-title">
            <span className="error-symbol" aria-hidden="true">
              !
            </span>
            <div>
              <p>摄像头连接失败</p>
              <h2 id="camera-error-title">{error.title}</h2>
              <span>{error.message}</span>
            </div>
            <button type="button" onClick={startCamera}>
              重试
            </button>
          </section>
        ) : null}

        {faceError && isActive ? (
          <section className="error-card" aria-labelledby="face-error-title">
            <span className="error-symbol" aria-hidden="true">
              !
            </span>
            <div>
              <p>人脸模型异常</p>
              <h2 id="face-error-title">无法启动表情识别</h2>
              <span>{faceError}</span>
            </div>
            <button type="button" onClick={() => window.location.reload()}>
              刷新页面
            </button>
          </section>
        ) : null}

        {isActive && calibration.status === 'ready' ? (
          <output className={`spring-cue cue-${interactionState}`}>
            <span aria-hidden="true" />
            {springCue}
          </output>
        ) : null}

        <div className="control-dock">
          <button
            className={`primary-action ${isActive ? 'stop-action' : ''}`}
            type="button"
            aria-label={isActive ? '关闭摄像头' : '启动摄像头体验'}
            onClick={isActive ? stopCamera : startCamera}
            disabled={isRequesting}
          >
            <span className="action-icon" aria-hidden="true" />
            <span>
              <strong>
                {isRequesting
                  ? '正在等待授权…'
                  : isActive
                    ? '关闭摄像头'
                    : error
                      ? '重新尝试'
                      : '开启摄像头'}
              </strong>
              <small>
                {isActive ? '立即停止视频流' : '点击后请求摄像头权限'}
              </small>
            </span>
          </button>
          <p>表情识别仅在本机浏览器中完成，不上传人脸画面。</p>
        </div>
      </section>

      <aside
        className={`debug-panel ${debugOpen ? 'is-open' : ''}`}
        aria-hidden={!debugOpen}
      >
        <div className="debug-heading">
          <div>
            <span>DEVELOPER VIEW</span>
            <h2>调试面板</h2>
          </div>
          <span className="debug-badge">SPRING STORY</span>
        </div>
        <div className="debug-section">
          <p className="debug-label">管线状态</p>
          <dl>
            {pipelineItems.map((item) => (
              <div key={item.label}>
                <dt>{item.label}</dt>
                <dd className={item.active ? 'value-active' : ''}>
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="debug-section metrics">
          <p className="debug-label">视频信号</p>
          <div>
            <span>
              <strong>{videoSize?.width ?? '--'}</strong> 宽度
            </span>
            <span>
              <strong>{videoSize?.height ?? '--'}</strong> 高度
            </span>
            <span className="orientation-value">
              <strong>
                <i className="portrait-word">竖屏</i>
                <i className="landscape-word">横屏</i>
              </strong>{' '}
              布局
            </span>
          </div>
        </div>
        <div className="debug-section expression-section">
          <p className="debug-label">BLENDSHAPE 原始系数</p>
          {(
            [
              ['smileLeft', 'Smile L', faceMetrics.expressions.smileLeft],
              ['smileRight', 'Smile R', faceMetrics.expressions.smileRight],
              ['jawOpen', 'Jaw Open', faceMetrics.expressions.jawOpen],
              [
                'cheekSquintLeft',
                'Cheek L',
                faceMetrics.expressions.cheekSquintLeft,
              ],
              [
                'cheekSquintRight',
                'Cheek R',
                faceMetrics.expressions.cheekSquintRight,
              ],
              [
                'mouthDimpleLeft',
                'Dimple L',
                faceMetrics.expressions.mouthDimpleLeft,
              ],
              [
                'mouthDimpleRight',
                'Dimple R',
                faceMetrics.expressions.mouthDimpleRight,
              ],
            ] as const
          ).map(([key, label, value]) => (
            <div className="expression-row" key={key}>
              <div>
                <span>{label}</span>
                <strong>{value.toFixed(3)}</strong>
              </div>
              <span className="expression-track" aria-hidden="true">
                <span style={{ width: `${Math.min(100, value * 100)}%` }} />
              </span>
            </div>
          ))}
        </div>
        <div className="debug-section signal-section">
          <div className="section-title-row">
            <p className="debug-label">标准化信号</p>
            <span
              className={`quality-chip ${faceMetrics.signal.accepted ? 'accepted' : ''}`}
            >
              质量 {faceMetrics.signal.quality.toFixed(2)}
            </span>
          </div>
          <div className="normalized-grid">
            <div>
              <span>normalizedSmile</span>
              <strong>{faceMetrics.signal.normalized.smile.toFixed(3)}</strong>
            </div>
            <div>
              <span>normalizedJawOpen</span>
              <strong>
                {faceMetrics.signal.normalized.jawOpen.toFixed(3)}
              </strong>
            </div>
          </div>
          <dl className="signal-details">
            <div>
              <dt>平滑 Smile</dt>
              <dd>{faceMetrics.signal.smoothed.smile.toFixed(3)}</dd>
            </div>
            <div>
              <dt>平滑 Jaw</dt>
              <dd>{faceMetrics.signal.smoothed.jawOpen.toFixed(3)}</dd>
            </div>
            <div>
              <dt>基线 Smile</dt>
              <dd>{calibration.baseline.smile.toFixed(3)}</dd>
            </div>
            <div>
              <dt>基线 Jaw</dt>
              <dd>{calibration.baseline.jawOpen.toFixed(3)}</dd>
            </div>
            <div>
              <dt>个人峰值 Smile</dt>
              <dd>{calibration.personalPeak.smile.toFixed(3)}</dd>
            </div>
            <div>
              <dt>个人峰值 Jaw</dt>
              <dd>{calibration.personalPeak.jawOpen.toFixed(3)}</dd>
            </div>
            <div>
              <dt>有效范围 Smile</dt>
              <dd>{calibration.effectiveRange.smile.toFixed(3)}</dd>
            </div>
            <div>
              <dt>有效范围 Jaw</dt>
              <dd>{calibration.effectiveRange.jawOpen.toFixed(3)}</dd>
            </div>
          </dl>
          <p className="rain-help">
            Smile 融合嘴角上扬、脸颊抬起与酒窝信号，并按个人峰值归一化
          </p>
        </div>
        <div className="debug-section state-machine-section">
          <div className="section-title-row">
            <p className="debug-label">互动状态机</p>
            <div className="machine-badges">
              <span
                className={`input-mode-chip ${simulationMode === 'live' ? 'live' : 'simulation'}`}
              >
                {simulationMode === 'live' ? 'LIVE INPUT' : 'SIMULATION'}
              </span>
              <span className={`machine-state state-${interactionState}`}>
                {interactionStateCopy[interactionState].label}
              </span>
            </div>
          </div>
          <div className="machine-inputs">
            <span>
              <small>Smile</small>
              <strong>{effectiveInput.smile.toFixed(2)}</strong>
            </span>
            <span>
              <small>Jaw</small>
              <strong>{effectiveInput.jawOpen.toFixed(2)}</strong>
            </span>
            <span>
              <small>Input</small>
              <strong>{effectiveInput.valid ? 'VALID' : 'HOLD'}</strong>
            </span>
            <span>
              <small>Energy</small>
              <strong>
                {interactionDiagnostics.expressionEnergy.toFixed(2)}
              </strong>
            </span>
          </div>
          <div className="laugh-diagnostics">
            <div>
              <span>微笑稳定确认</span>
              <strong>
                {Math.round(
                  interactionDiagnostics.smileCandidateProgress * 100,
                )}
                %
              </strong>
            </div>
            <span className="diagnostic-track smile" aria-hidden="true">
              <span
                style={{
                  width: `${interactionDiagnostics.smileCandidateProgress * 100}%`,
                }}
              />
            </span>
            <div>
              <span>大笑信号匹配</span>
              <strong>
                {Math.round(interactionDiagnostics.laughSignalScore * 100)}%
              </strong>
            </div>
            <span className="diagnostic-track" aria-hidden="true">
              <span
                style={{
                  width: `${interactionDiagnostics.laughSignalScore * 100}%`,
                }}
              />
            </span>
            <div>
              <span>持续确认</span>
              <strong>
                {Math.round(
                  interactionDiagnostics.laughCandidateProgress * 100,
                )}
                %
              </strong>
            </div>
            <span className="diagnostic-track candidate" aria-hidden="true">
              <span
                style={{
                  width: `${interactionDiagnostics.laughCandidateProgress * 100}%`,
                }}
              />
            </span>
            <p
              className={
                interactionDiagnostics.laughPath ? 'candidate-active' : ''
              }
            >
              {laughBlocker}
            </p>
          </div>
          <div className="threshold-summary">
            <span>
              微笑进入 ≥ {DEFAULT_STATE_MACHINE_SETTINGS.smileEnter.toFixed(2)}
            </span>
            <span>
              微笑退出 ≤ {DEFAULT_STATE_MACHINE_SETTINGS.smileExit.toFixed(2)}
            </span>
            <span>
              均衡：S ≥{' '}
              {DEFAULT_STATE_MACHINE_SETTINGS.laughSmileEnter.toFixed(2)} + J ≥{' '}
              {DEFAULT_STATE_MACHINE_SETTINGS.laughJawEnter.toFixed(2)}
            </span>
            <span>
              张嘴主导：J ≥{' '}
              {DEFAULT_STATE_MACHINE_SETTINGS.laughStrongJawEnter.toFixed(2)} +
              S ≥{' '}
              {DEFAULT_STATE_MACHINE_SETTINGS.laughMediumSmileEnter.toFixed(2)}
            </span>
            <span>
              笑容主导：S ≥{' '}
              {DEFAULT_STATE_MACHINE_SETTINGS.laughStrongSmileEnter.toFixed(2)}{' '}
              + J ≥{' '}
              {DEFAULT_STATE_MACHINE_SETTINGS.laughMediumJawEnter.toFixed(2)}
            </span>
            <span>冷却 {DEFAULT_STATE_MACHINE_SETTINGS.cooldownMs} ms</span>
          </div>
        </div>
        <div className="debug-section rain-debug-section">
          <div className="section-title-row">
            <p className="debug-label">EMOTION BLOOM · 微笑</p>
            <span className={`rain-engine-state ${effectsStatus}`}>
              {effectsStatus.toUpperCase()}
            </span>
          </div>
          <div className="rain-metrics">
            <span>
              <small>强度</small>
              <strong>
                {Math.round(effectsMetrics.bloom.intensity * 100)}%
              </strong>
            </span>
            <span>
              <small>表情能量</small>
              <strong>
                {Math.round(interactionDiagnostics.expressionEnergy * 100)}%
              </strong>
            </span>
            <span>
              <small>活跃 / 上限</small>
              <strong>
                {effectsMetrics.bloom.activeElements} /{' '}
                {effectsMetrics.bloom.capacity}
              </strong>
            </span>
            <span>
              <small>渲染 FPS</small>
              <strong>
                {effectsMetrics.fps ? effectsMetrics.fps.toFixed(0) : '--'}
              </strong>
            </span>
            <span>
              <small>演出阶段</small>
              <strong>{effectsMetrics.bloom.stage.toUpperCase()}</strong>
            </span>
            <span>
              <small>消散余韵</small>
              <strong>
                {effectsMetrics.bloom.dissolving ? 'ACTIVE' : 'IDLE'}
              </strong>
            </span>
            <span>
              <small>画质等级</small>
              <strong>{effectsMetrics.quality.toUpperCase()}</strong>
            </span>
          </div>
          <span className="rain-intensity-track" aria-hidden="true">
            <span
              style={{ width: `${effectsMetrics.bloom.intensity * 100}%` }}
            />
          </span>
          <p className="rain-help">
            嘴角星芒 → 脸颊光丝 → 眼角全息花瓣 → 头后未闭合光弧 · 按 S 测试
          </p>
          {effectsError ? <p className="rain-error">{effectsError}</p> : null}
        </div>
        <div className="debug-section firework-debug-section">
          <div className="section-title-row">
            <p className="debug-label">PIXIJS 像素烟花</p>
            <span className="firework-trigger-chip">ON ENTER · LAUGH</span>
          </div>
          <div className="rain-metrics">
            <span>
              <small>活跃 / 上限</small>
              <strong>
                {effectsMetrics.fireworks.activeParticles} /{' '}
                {effectsMetrics.fireworks.capacity || '--'}
              </strong>
            </span>
            <span>
              <small>触发次数</small>
              <strong>{effectsMetrics.fireworks.triggerCount}</strong>
            </span>
            <span>
              <small>演出阶段</small>
              <strong>{effectsMetrics.fireworks.phase.toUpperCase()}</strong>
            </span>
            <span>
              <small>头部碰撞</small>
              <strong>{effectsMetrics.fireworks.collisions}</strong>
            </span>
            <span>
              <small>穿透修正</small>
              <strong>{effectsMetrics.fireworks.penetrationCorrections}</strong>
            </span>
            <span>
              <small>检测 / 帧</small>
              <strong>{effectsMetrics.fireworks.collisionChecks}</strong>
            </span>
            <span>
              <small>碰撞耗时</small>
              <strong>
                {effectsMetrics.fireworks.collisionMs.toFixed(2)} ms
              </strong>
            </span>
          </div>
          <p className="rain-help">
            像素聚能环 → 方块矩阵主爆 → 分段字符拖尾 → 霓虹纸屑余韵 ·
            头部可撞散 · 按 L 测试
          </p>
        </div>
        <div className="debug-section collider-debug-section">
          <div className="section-title-row">
            <p className="debug-label">头部碰撞体</p>
            <span
              className={`quality-chip ${faceMetrics.headCollider.valid ? 'accepted' : ''}`}
            >
              {faceMetrics.headCollider.valid ? 'TRACKING' : 'WAITING'}
            </span>
          </div>
          <dl className="signal-details">
            <div>
              <dt>屏幕中心</dt>
              <dd>
                {faceMetrics.headCollider.valid
                  ? `${faceMetrics.headCollider.centerX.toFixed(0)}, ${faceMetrics.headCollider.centerY.toFixed(0)}`
                  : '--'}
              </dd>
            </div>
            <div>
              <dt>椭圆半径</dt>
              <dd>
                {faceMetrics.headCollider.valid
                  ? `${faceMetrics.headCollider.radiusX.toFixed(0)} × ${faceMetrics.headCollider.radiusY.toFixed(0)}`
                  : '--'}
              </dd>
            </div>
            <div>
              <dt>头部旋转</dt>
              <dd>
                {faceMetrics.headCollider.valid
                  ? `${((faceMetrics.headCollider.rotation * 180) / Math.PI).toFixed(1)}°`
                  : '--'}
              </dd>
            </div>
          </dl>
          <p className="rain-help">
            镜像坐标 · Cover 裁切补偿 · 95 ms 防抖平滑
          </p>
        </div>
        <div className="debug-section simulation-section">
          <p className="debug-label">键盘模拟</p>
          <div className="simulation-buttons">
            {(['live', 'neutral', 'smile', 'laugh'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={simulationMode === mode ? 'selected' : ''}
                onClick={() => setSimulationMode(mode)}
              >
                <kbd>
                  {mode === 'live' ? 'Esc' : mode.charAt(0).toUpperCase()}
                </kbd>
                {simulationCopy[mode]}
              </button>
            ))}
          </div>
          <p className="simulation-help">
            S 微笑 · L 大笑 · N 回落 · Esc 恢复摄像头
          </p>
        </div>
        <div className="debug-section transition-section">
          <div className="section-title-row">
            <p className="debug-label">状态切换记录</p>
            <button
              type="button"
              onClick={clearTransitions}
              disabled={transitions.length === 0}
            >
              清空
            </button>
          </div>
          {transitions.length === 0 ? (
            <p className="empty-transitions">暂无切换，按 S 或 L 开始模拟</p>
          ) : (
            <ol className="transition-list">
              {transitions.map((transition) => (
                <li key={transition.id}>
                  <span>
                    {new Date(transition.recordedAt).toLocaleTimeString(
                      'zh-CN',
                      { hour12: false },
                    )}
                  </span>
                  <strong>
                    {transition.from} → {transition.to}
                  </strong>
                  <small>{transition.reason}</small>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="debug-section calibration-section">
          <div className="section-title-row">
            <p className="debug-label">个体表情校准</p>
            <button type="button" onClick={recalibrate} disabled={!isActive}>
              重新校准
            </button>
          </div>
          <span className="calibration-track" aria-hidden="true">
            <span style={{ width: `${calibration.progress * 100}%` }} />
          </span>
          <p className="calibration-copy">
            {calibrationInstruction}
            {calibration.status === 'ready'
              ? ` · ${calibration.sampleCount} 个基线样本`
              : ''}
          </p>
        </div>
        <div className="debug-section tuning-section">
          <p className="debug-label">信号调参</p>
          <label>
            <span>
              质量门槛{' '}
              <strong>
                {expressionSettings.confidenceThreshold.toFixed(2)}
              </strong>
            </span>
            <input
              type="range"
              min="0.4"
              max="0.9"
              step="0.01"
              value={expressionSettings.confidenceThreshold}
              onChange={(event) =>
                updateExpressionSetting(
                  'confidenceThreshold',
                  Number(event.target.value),
                )
              }
            />
          </label>
          <label>
            <span>
              平滑时间 <strong>{expressionSettings.smoothingTimeMs} ms</strong>
            </span>
            <input
              type="range"
              min="60"
              max="400"
              step="10"
              value={expressionSettings.smoothingTimeMs}
              onChange={(event) =>
                updateExpressionSetting(
                  'smoothingTimeMs',
                  Number(event.target.value),
                )
              }
            />
          </label>
          <label>
            <span>
              Smile 灵敏度{' '}
              <strong>{expressionSettings.smileRange.toFixed(2)}</strong>
            </span>
            <input
              type="range"
              min="0.2"
              max="0.8"
              step="0.01"
              value={expressionSettings.smileRange}
              onChange={(event) =>
                updateExpressionSetting(
                  'smileRange',
                  Number(event.target.value),
                )
              }
            />
          </label>
          <label>
            <span>
              Jaw 灵敏度{' '}
              <strong>{expressionSettings.jawRange.toFixed(2)}</strong>
            </span>
            <input
              type="range"
              min="0.2"
              max="0.8"
              step="0.01"
              value={expressionSettings.jawRange}
              onChange={(event) =>
                updateExpressionSetting('jawRange', Number(event.target.value))
              }
            />
          </label>
        </div>
        <div className="debug-section metrics inference-metrics">
          <p className="debug-label">模型性能</p>
          <div>
            <span>
              <strong>{faceMetrics.landmarkCount || '--'}</strong> 关键点
            </span>
            <span>
              <strong>{faceMetrics.inferenceMs?.toFixed(1) ?? '--'}</strong> ms
            </span>
            <span>
              <strong>
                {faceMetrics.inferenceFps
                  ? faceMetrics.inferenceFps.toFixed(1)
                  : '--'}
              </strong>{' '}
              FPS
            </span>
          </div>
        </div>
        <div className="debug-footer">
          <span className={`status-dot ${status}`} aria-hidden="true" />
          {error
            ? error.title
            : faceError
              ? '人脸模型异常'
              : effectsError
                ? '粒子引擎异常'
                : faceMetrics.hasFace
                  ? '已检测到单张人脸'
                  : isActive
                    ? '等待检测到人脸'
                    : '页面层运行正常'}
        </div>
      </aside>
    </main>
  );
}
