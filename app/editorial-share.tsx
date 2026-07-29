"use client";

import { useState } from "react";

type Props = { title: "review" | "list"; description: string };

export function EditorialShare({ title, description }: Props) {
  const [message, setMessage] = useState("");
  async function share() {
    try {
      const url = window.location.href;
      const canShare = "share" in navigator;
      if (canShare) await navigator.share({ title: `CineApe ${title}`, text: description, url });
      else await navigator.clipboard.writeText(url);
      setMessage(canShare ? "Ready to share." : "Link copied.");
    } catch (error) {
      if ((error as Error).name !== "AbortError") setMessage("Couldn’t copy the link.");
    }
  }
  return <div className="editorial-share"><button type="button" onClick={() => void share()}>Share this {title} ↗</button>{message && <span role="status">{message}</span>}</div>;
}
