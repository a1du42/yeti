"use client";

export default function AppError({ reset }: { reset: () => void }) {
  return <main style={{ maxWidth: 640, margin: "64px auto", padding: 24 }}>
    <h1>Не удалось открыть страницу</h1>
    <p style={{ margin: "16px 0", color: "var(--color-text-secondary)" }}>Проверьте соединение и попробуйте ещё раз.</p>
    <button className="button button-primary" onClick={reset}>Повторить</button>
  </main>;
}
