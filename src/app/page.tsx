export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm lg:flex">
        <h1 className="text-4xl font-bold">Missed Call Text Back</h1>
      </div>
      <div className="flex flex-col items-center justify-center">
        <p className="text-xl mb-4">Automated text responses for missed calls</p>
        <a 
          href="/dashboard" 
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Go to Dashboard
        </a>
      </div>
    </main>
  )
}
