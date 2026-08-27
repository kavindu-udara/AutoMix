import MixBuilder from "@/components/mix-builder";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">AutoMix</h1>
        <p className="text-gray-500 mb-8">
          Upload two songs. Get a seamless DJ-style transition.
        </p>

        <MixBuilder />
      </div>
    </main>
  );
}
