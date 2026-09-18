"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { NodeProps, NodeResizer } from "@xyflow/react";
import { useEffect, useState } from "react";

import type { CanvasNodeData } from "@/lib/app-types";

export function ImageNode({ data, selected }: NodeProps) {
  const nodeData = data as CanvasNodeData;
  const loading = nodeData.status && !["success", "fail", "timeout"].includes(nodeData.status);
  const [imageReady, setImageReady] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [imageAttempt, setImageAttempt] = useState(0);

  useEffect(() => {
    setImageReady(false);
    setImageError(false);
    setImageAttempt(0);
  }, [nodeData.imageUrl]);

  const imageUrl = nodeData.imageUrl && imageAttempt
    ? `${nodeData.imageUrl}${nodeData.imageUrl.includes("?") ? "&" : "?"}retry=${imageAttempt}`
    : nodeData.imageUrl;

  return (
    <div className="relative size-full overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <NodeResizer keepAspectRatio isVisible={selected} minWidth={40} minHeight={40} lineClassName="!border-blue-500" handleClassName="!size-2.5 !border-blue-500 !bg-white" />
      {nodeData.imageUrl ? (
        <>
          {!imageReady && !imageError ? <div className="absolute inset-0 z-0 animate-pulse bg-zinc-100" /> : null}
          {imageError ? (
            <div className="absolute inset-0 z-10 grid place-items-center bg-zinc-50 text-xs text-zinc-500">
              <button
                type="button"
                className="nodrag inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 shadow-sm hover:bg-zinc-100"
                onClick={(event) => {
                  event.stopPropagation();
                  setImageError(false);
                  setImageAttempt((value) => value + 1);
                }}
              >
                <RefreshCw size={13} /> 图片加载失败，点击重试
              </button>
            </div>
          ) : null}
          {/* The stable authenticated URL redirects to Storage CDN; prioritize canvas images over chat history. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="画布图片"
            draggable={false}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onLoad={() => setImageReady(true)}
            onError={() => {
              setImageReady(false);
              if (imageAttempt < 2) {
                window.setTimeout(() => setImageAttempt((value) => value + 1), 500 * (imageAttempt + 1));
              } else {
                setImageError(true);
              }
            }}
            className="relative z-[1] size-full select-none object-contain"
          />
        </>
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-3 bg-[linear-gradient(135deg,#fafafa,#f0f0f0)] px-5 text-center text-xs text-zinc-400">
          {loading ? <Loader2 size={24} className="animate-spin text-zinc-700" /> : null}
          <span>{loading ? "正在生成图片…" : nodeData.status === "fail" ? "生成失败" : nodeData.label || "图片占位"}</span>
        </div>
      )}
    </div>
  );
}
