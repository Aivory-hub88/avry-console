import type { Metadata } from "next"
import { Inter_Tight } from "next/font/google"
import "@/styles/globals.css"
import { RouterProvider } from "@/contexts/RouterContext"

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
      <body className={`bg-[var(--bg-main)] ${interTight.className}`}>
        <RouterProvider>{children}</RouterProvider>
      </body>
    </html>
  )
}
