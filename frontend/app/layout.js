import "./globals.css";

export const metadata = {
  title: "Certificate Verification",
  description:
    "Verify the authenticity of a digital certificate anchored on the Ethereum blockchain.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
