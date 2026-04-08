import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "ZapDigest | Inteligência Editorial para Líderes",
  description:
    "Assistente pessoal de WhatsApp que monitora grupos e conversas e entrega resumos inteligentes gerados por IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable}`}>
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
        />
      </head>
      <body
        className={cn(
          "font-sans antialiased bg-[#0b1326] text-[#dae2fd] selection:bg-primary/30"
        )}
      >
        {children}
      </body>
    </html>
  );
}
