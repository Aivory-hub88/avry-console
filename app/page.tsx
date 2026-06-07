export default function ConsoleLandingPage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center text-white">
        <h1 className="text-2xl font-semibold mb-2">Aivory Console Service</h1>
        <p className="text-white/60">API service running on port 9001</p>
        <p className="text-white/40 text-sm mt-4">
          Console UI is served via the User Dashboard at port 9000
        </p>
      </div>
    </div>
  )
}
