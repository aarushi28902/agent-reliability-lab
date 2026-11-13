import "./globals.css";

export const metadata = {
  title: "Claims Helper: agent reliability lab",
  description: "A demo insurance helper with made-up data, and the test results behind it.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
