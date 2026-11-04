"use client";

import { VideoCamera } from "@phosphor-icons/react";
import styles from "./launch-preview.module.css";

export function LaunchPreview({ thumbnail }: { thumbnail: string | null }) {
  return <span className={styles.preview} aria-hidden="true">
    <VideoCamera size={20} weight="regular" />
    {thumbnail && <img key={thumbnail} src={thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer"
      onError={event => { event.currentTarget.hidden = true; }} />}
  </span>;
}
