export function GET() {
  const number = Math.floor(Math.random() * 6) + 1;

  return new Response(String(number), {
    headers: {
      "Content-Type": "application/json",
    },
  });
}
