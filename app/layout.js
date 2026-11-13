export const metadata = { title: "html2apk", description: "Convert HTML to Android APK" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
