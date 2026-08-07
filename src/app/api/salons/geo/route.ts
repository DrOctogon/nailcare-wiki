import { getSalonGeo } from "@/lib/scrape/salons";
import { parseSalonQuery } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url);
    const query = parseSalonQuery(searchParams);
    const result = await getSalonGeo(query);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
