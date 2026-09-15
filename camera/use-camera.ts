'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'error';

export type CameraError = {
  title: string;
  message: string;
  kind: 'unsupported' | 'insecure' | 'denied' | 'missing' | 'busy' | 'unknown';
};

type VideoSize = { width: number; height: number } | null;

function describeCameraError(error: unknown): CameraError {
  if (!window.isSecureContext) {
    return {
      kind: 'insecure',
      title: '需要安全连接',
      message: '请使用 HTTPS 地址或 localhost 打开页面，浏览器才能启用摄像头。',
    };
  }

  if (!(error instanceof DOMException)) {
    return {
      kind: 'unknown',
      title: '无法启动摄像头',
      message: '请检查浏览器的摄像头设置，然后重试。',
    };
  }

  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return {
        kind: 'denied',
        title: '摄像头权限未开启',
        message: '请在浏览器地址栏或系统设置中允许摄像头，然后重试。',
      };
    case 'NotFoundError':
    case 'OverconstrainedError':
      return {
        kind: 'missing',
        title: '未找到可用摄像头',
        message: '请连接摄像头，或确认设备没有被系统禁用。',
      };
    case 'NotReadableError':
    case 'AbortError':
      return {
        kind: 'busy',
        title: '摄像头暂时不可用',
        message: '它可能正被其他应用使用。关闭视频会议或相机应用后重试。',
      };
    default:
      return {
        kind: 'unknown',
        title: '无法启动摄像头',
        message: '请刷新页面，或换用支持摄像头的现代浏览器重试。',
      };
  }
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<CameraError | null>(null);
  const [videoSize, setVideoSize] = useState<VideoSize>(null);

  const releaseStream = useCallback(() => {
    requestIdRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopCamera = useCallback(() => {
    releaseStream();
    setStatus('idle');
    setError(null);
    setVideoSize(null);
  }, [releaseStream]);

  const startCamera = useCallback(async () => {
    if (!window.isSecureContext) {
      setStatus('error');
      setError(describeCameraError(new DOMException('', 'SecurityError')));
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError({
        kind: 'unsupported',
        title: '当前浏览器不支持摄像头',
        message: '请使用最新版 Chrome、Safari 或 Edge 打开页面。',
      });
      return;
    }

    releaseStream();
    const requestId = requestIdRef.current;
    setStatus('requesting');
    setError(null);

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'user' },
          width:
            window.innerWidth <= 720 || (navigator.hardwareConcurrency ?? 8) <= 4
              ? { ideal: 640, max: 720 }
              : { ideal: 960, max: 1280 },
          height:
            window.innerWidth <= 720 || (navigator.hardwareConcurrency ?? 8) <= 4
              ? { ideal: 480, max: 720 }
              : { ideal: 720, max: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      });

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (!videoRef.current) throw new Error('Video element is unavailable.');
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStatus('active');
      setVideoSize({ width: videoRef.current.videoWidth, height: videoRef.current.videoHeight });
    } catch (caughtError) {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setStatus('error');
      setError(describeCameraError(caughtError));
    }
  }, [releaseStream]);

  const updateVideoSize = useCallback(() => {
    const video = videoRef.current;
    if (video?.videoWidth && video.videoHeight) {
      setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const releaseOnPageExit = () => releaseStream();
    window.addEventListener('pagehide', releaseOnPageExit);

    return () => {
      mountedRef.current = false;
      window.removeEventListener('pagehide', releaseOnPageExit);
      releaseStream();
    };
  }, [releaseStream]);

  return { videoRef, status, error, videoSize, startCamera, stopCamera, updateVideoSize };
}
