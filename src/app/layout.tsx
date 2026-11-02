import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "YETI STREAM", template: "%s · YETI STREAM" },
  description: "Рабочее пространство YETI STREAM",
  robots: { index: false, follow: false },
};

const themeScript = `(function(){try{var t=localStorage.getItem('yeti-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme}catch(e){}})()`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru" suppressHydrationWarning>
    <head>
      <link rel="preload" href="/assets/fonts/rubik-400-700.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
      <script dangerouslySetInnerHTML={{ __html: themeScript }} />
    </head>
    <body>{children}</body>
  </html>;
}
