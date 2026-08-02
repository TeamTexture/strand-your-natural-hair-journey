// Unit test for the manuscript retrieval core (_shared/rag.ts).
//
// Asserts retrievePassages() delegates ranking to the database RPC
// `match_manuscript_chunks` (whole-corpus vector search) and preserves
// the Passage shape its callers depend on.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("https://esm.sh/@supabase/supabase-js@2.95.0", () => ({
  createClient: () => ({ rpc: rpcMock }),
}));

// Deno + fetch shims: rag.ts reads env via the Deno global and embeds the
// query through the OpenAI embeddings endpoint.
const EMBEDDING_DIMS = 1536;

beforeEach(() => {
  rpcMock.mockReset();
  (globalThis as unknown as { Deno: unknown }).Deno = {
    env: {
      get: (k: string) =>
        ({
          OPENAI_API_KEY: "test-key",
          SUPABASE_URL: "https://example.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role",
        })[k],
    },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(EMBEDDING_DIMS).fill(0.01) }],
      }),
    })),
  );
});

describe("retrievePassages", () => {
  it("calls the match_manuscript_chunks RPC and preserves the Passage shape", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          body: "Cleanse the scalp first, then the hair.",
          chapter: 13,
          chapter_title: "Wash Day",
          section_heading: "The two cleanses",
          page_start: 180,
          page_end: 182,
          similarity: 0.87,
        },
      ],
      error: null,
    });

    const { retrievePassages } = await import(
      "../../supabase/functions/_shared/rag.ts"
    );
    const passages = await retrievePassages("high porosity wash day", 3, [13]);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, args] = rpcMock.mock.calls[0];
    expect(fnName).toBe("match_manuscript_chunks");
    expect(args.match_count).toBe(3);
    expect(args.chapter_filter).toEqual([13]);
    expect(typeof args.query_embedding).toBe("string");

    expect(passages).toHaveLength(1);
    expect(passages[0]).toMatchObject({
      body: "Cleanse the scalp first, then the hair.",
      chapter: 13,
      chapter_title: "Wash Day",
      section_heading: "The two cleanses",
      page_start: 180,
      page_end: 182,
      similarity: 0.87,
    });
  });

  it("passes a null chapter filter when none is supplied", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { retrievePassages } = await import(
      "../../supabase/functions/_shared/rag.ts"
    );
    const passages = await retrievePassages("moisture retention");
    expect(passages).toEqual([]);
    expect(rpcMock.mock.calls[0][1].chapter_filter).toBeNull();
  });
});
