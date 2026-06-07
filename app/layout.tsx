import type { Metadata } from "next"
import { Inter_Tight } from "next/font/google"
import "@/styles/globals.css"

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
  variable: "--font-inter-tight",
})

export const metadata: Metadata = {
  title: "Aivory Console Service",
  description: "AI Console API Service",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={interTight.variable}>
      <body className={`bg-[#353531] ${interTight.className}`}>
        {children}
      </body>
    </html>
  )
}
