import type { MouseEventHandler, PointerEventHandler } from "react";

export function createImageCardPointerGuard(): {
  onPointerDownCapture: PointerEventHandler<HTMLDivElement>;
  onPointerMoveCapture: PointerEventHandler<HTMLDivElement>;
  onPointerUpCapture: PointerEventHandler<HTMLDivElement>;
  onPointerCancelCapture: PointerEventHandler<HTMLDivElement>;
  onClickCapture: MouseEventHandler<HTMLDivElement>;
};
