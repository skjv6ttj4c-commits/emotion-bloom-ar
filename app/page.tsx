'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { useCamera } from '@/camera/use-camera';
import { useFaceLandmarker } from '@/face/use-face-landmarker';
import { useInteractionState } from '@/interaction/use-interaction-state';
import { useVisualEffects } from '@/effects/use-visual-effects';

const statusCopy = {
  idle: 'STANDBY',
  requesting: 'CONNECTING',
  active: 'CAMERA LIVE',
  error: 'ACTION NEEDED',
} as const;

const expressionGuides = [
  {
    key: 'smile',
    label: 'SMILE',
    instruction: 'SMILE AT THE CAMERA',
    image: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/guides/01-smile.jpg`,
  },
  {
    key: 'laugh',
    label: 'LAUGH',
    instruction: 'OPEN YOUR MOUTH AND LAUGH',
    image: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/guides/02-laugh.jpg`,
  },
] as const;

type GuideStep = 0 | 1 | 2;

export default function Home() {
  const [guideStep, setGuideStep] = useState<GuideStep>(0);
  const laughTriggerBaseline = useRef(0);
  const {
    videoRef, status, error, startCamera, stopCamera,
  } = useCamera();
  const isActive = status === 'active';
  const isRequesting = status === 'requesting';
  const {
    canvasRef: faceCanvasRef,
    status: faceStatus,
    metrics: faceMetrics,
    error: faceError,
    loadProgress: faceLoadProgress,
    loadStage: faceLoadStage,
    modelCacheHit,
    loadedBytes: faceLoadedBytes,
    totalBytes: faceTotalBytes,
  } = useFaceLandmarker(videoRef, isActive);
  const {
    state: interactionState,
    transitions,
    diagnostics: interactionDiagnostics,
  } = useInteractionState({
    smile: faceMetrics.signal.normalized.smile,
    jawOpen: faceMetrics.signal.normalized.jawOpen,
    valid: faceMetrics.hasFace && faceMetrics.signal.accepted,
  });
  const { hostRef: effectsHostRef, metrics: effectsMetrics } = useVisualEffects(
    interactionState,
    interactionDiagnostics.expressionEnergy,
    transitions[0],
    faceMetrics.headCollider,
    faceLoadStage === 'ready',
  );

  const recognizedGuide = ['laugh-entering', 'laughing', 'celebrating'].includes(
    interactionState,
  )
    ? 1
    : ['smile-entering', 'smiling'].includes(interactionState)
      ? 0
      : null;
  const selectedGuide = guideStep < 2 ? guideStep : recognizedGuide;
  const guideComplete = guideStep === 2;
  const experienceGuide =
    faceStatus === 'loading'
      ? faceLoadStage === 'downloading'
        ? `DOWNLOADING FACE MODEL · ${Math.round((faceLoadedBytes / Math.max(faceTotalBytes, 1)) * 100)}%`
        : faceLoadStage === 'loading-code'
          ? 'LOADING THE VISION ENGINE'
          : faceLoadStage === 'preparing-engine'
            ? 'PREPARING ON-DEVICE VISION'
            : 'STARTING FACE TRACKING'
      : faceStatus === 'error'
        ? 'FACE TRACKING IS UNAVAILABLE'
        : !faceMetrics.hasFace
          ? 'MOVE INTO FRAME'
          : !faceMetrics.signal.accepted
            ? 'FACE THE CAMERA AND MOVE A LITTLE CLOSER'
            : guideStep < 2
              ? expressionGuides[guideStep as 0 | 1].instruction
              : '';
  const guideTone = faceStatus === 'loading' ? 'preparing' : interactionState;
  const coverWarmupCopy =
    faceLoadStage === 'ready'
      ? modelCacheHit
        ? 'MODEL READY · CACHED ON THIS DEVICE'
        : 'MODEL READY · TAP TO JOIN'
      : faceLoadStage === 'error'
        ? 'TAP TO RETRY MODEL + CAMERA'
        : 'OPEN NOW · SETUP CONTINUES IN BACKGROUND';
  const smileEffectVisible =
    ['smile-entering', 'smiling'].includes(interactionState) &&
    ['awakening', 'smile'].includes(effectsMetrics.bloom.stage) &&
    effectsMetrics.bloom.activeElements > 5;

  useEffect(() => {
    if (!isActive) return;
    let timer: number | undefined;
    if (guideStep === 0 && smileEffectVisible) {
      timer = window.setTimeout(() => {
        laughTriggerBaseline.current = effectsMetrics.fireworks.triggerCount;
        setGuideStep(1);
      }, 650);
    } else if (
      guideStep === 1 &&
      effectsMetrics.fireworks.triggerCount > laughTriggerBaseline.current
    ) {
      timer = window.setTimeout(() => setGuideStep(2), 850);
    }
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [effectsMetrics.fireworks.triggerCount, guideStep, isActive, smileEffectVisible]);

  function handleStartCamera() {
    setGuideStep(0);
    laughTriggerBaseline.current = 0;
    void startCamera();
  }

  return (
    <main className={`app-shell camera-${status} interaction-${interactionState} ${faceMetrics.hasFace ? 'has-face' : ''}`}>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#stage" aria-label="Pixel Live home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>PIXEL LIVE</span>
        </a>
        <output className="status-pill">
          <span className={`status-dot ${status}`} aria-hidden="true" />
          {statusCopy[status]}
        </output>
      </header>

      <section className="stage" id="stage" aria-labelledby="stage-title">
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay muted playsInline
          aria-label="前置摄像头实时画面"
        />
        <div ref={effectsHostRef} className="effects-layer" aria-hidden="true" />
        <canvas ref={faceCanvasRef} className="face-overlay" aria-hidden="true" />
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

        {!isActive ? (
          <div className="stage-copy">
            <p className="eyebrow">FACE-LED LIVE EFFECTS / 001</p>
            <h1 id="stage-title">WELCOME BACK<br />TO THE LIVE ROOM.</h1>
            <p className="stage-description">Turn on your camera. Your expressions run the show.</p>
          </div>
        ) : (
          <h1 className="visually-hidden" id="stage-title">Pixel Live expression studio</h1>
        )}

        {error ? (
          <section className="error-card" aria-labelledby="camera-error-title">
            <span className="error-symbol" aria-hidden="true">!</span>
            <div><p>CAMERA UNAVAILABLE</p><h2 id="camera-error-title">{error.title}</h2><span>{error.message}</span></div>
            <button type="button" onClick={handleStartCamera}>TRY AGAIN</button>
          </section>
        ) : null}

        {faceError && isActive ? (
          <section className="error-card" aria-labelledby="face-error-title">
            <span className="error-symbol" aria-hidden="true">!</span>
            <div><p>FACE MODEL ERROR</p><h2 id="face-error-title">Expression tracking could not start</h2><span>{faceError}</span></div>
            <button type="button" onClick={() => window.location.reload()}>RELOAD</button>
          </section>
        ) : null}

        {isActive && !faceError ? (
          <>
            <section className={`expression-guide guide-${guideTone} ${guideComplete ? 'is-complete' : ''}`} aria-label="Expression guide">
              <span className="expression-guide-label">试试这些表情吧～</span>
              <ul className="expression-strip">
                {expressionGuides.map((guide, index) => (
                  <li key={guide.key}>
                    <button
                      type="button"
                      className={selectedGuide === index ? 'is-selected' : ''}
                      aria-label={`${guide.label}: ${guide.instruction}`}
                      aria-current={selectedGuide === index ? 'step' : undefined}
                      aria-disabled="true"
                      tabIndex={-1}
                    >
                      <Image src={guide.image} alt="" width={104} height={104} sizes="(max-width: 720px) 81px, 117px" priority />
                      <span>{String(index + 1).padStart(2, '0')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            {!guideComplete ? (
              <output key={guideStep} className="expression-feedback" aria-live="polite" aria-atomic="true">
                <strong>{experienceGuide}</strong>
              </output>
            ) : null}
          </>
        ) : null}

        <div className="control-dock">
          <button
            className={`primary-action ${isActive ? 'stop-action' : ''}`}
            type="button"
            aria-label={isActive ? 'Turn off camera' : 'Open camera'}
            onClick={isActive ? stopCamera : handleStartCamera}
            disabled={isRequesting}
          >
            <span className="action-icon" aria-hidden="true" />
            <span>
              <strong>{isRequesting ? 'CONNECTING…' : isActive ? 'END SESSION' : error ? 'TRY AGAIN' : 'OPEN CAMERA'}</strong>
              <small>{isActive ? 'STOP VIDEO STREAM' : coverWarmupCopy}</small>
            </span>
            {!isActive && faceLoadStage !== 'error' ? (
              <i className="model-load-bar" aria-hidden="true"><span style={{ width: `${faceLoadProgress * 100}%` }} /></i>
            ) : null}
          </button>
          <p>ON-DEVICE FACE TRACKING · NO VIDEO UPLOAD</p>
        </div>
      </section>
    </main>
  );
}
