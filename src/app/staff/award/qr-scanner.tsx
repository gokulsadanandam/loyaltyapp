"use client";

import { ScanLineIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Minimal typing for the Shape Detection API (Chrome/Edge/Android; not Safari/Firefox yet).
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const noopSubscribe = () => () => undefined;

function detectorCtor(): BarcodeDetectorCtor | null {
  const ctor = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  return ctor ?? null;
}

/**
 * Opens the camera and reads a member QR. Where BarcodeDetector isn't available,
 * staff type the code (or use a USB/Bluetooth scanner that types into the field).
 */
export function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Client-only capability: the server snapshot is false, so hydration matches and
  // React re-renders with the real value in the browser.
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => detectorCtor() !== null && "mediaDevices" in navigator,
    () => false,
  );

  useEffect(() => {
    if (!open) return;
    const Ctor = detectorCtor();
    if (!Ctor) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    // Mutated by the cleanup below; an object so TS doesn't narrow it to `false`.
    const run = { stopped: false };
    const detector = new Ctor({ formats: ["qr_code"] });

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        const video = videoRef.current;
        if (!video || run.stopped) return;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (run.stopped) return;
          try {
            const [hit] = await detector.detect(video);
            if (hit?.rawValue) {
              onScan(hit.rawValue);
              setOpen(false);
              return;
            }
          } catch {
            // Frame not ready yet; keep trying.
          }
          frame = requestAnimationFrame(() => void tick());
        };
        void tick();
      } catch {
        setMessage("Camera unavailable. Check the permission, or type the member code.");
      }
    })();

    return () => {
      run.stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => {
        t.stop();
      });
    };
  }, [open, onScan]);

  if (!supported) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
      >
        <ScanLineIcon aria-hidden />
        Scan QR
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan member QR</DialogTitle>
            <DialogDescription>
              Point the camera at the code on the customer&apos;s phone.
            </DialogDescription>
          </DialogHeader>
          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : (
            <video
              ref={videoRef}
              className="aspect-square w-full rounded-lg bg-black object-cover"
              muted
              playsInline
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
