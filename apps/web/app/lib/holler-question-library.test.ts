import { describe, expect, it } from "vitest";

import { scriptContentV1Schema } from "@holler/domain";

import { hollerQuestionPrompts } from "./holler-question-library";

describe("Holler question library", () => {
  it("loads all 50 stable, selectable questions", () => {
    expect(hollerQuestionPrompts).toHaveLength(50);
    expect(
      new Set(hollerQuestionPrompts.map((prompt) => prompt.library.questionId))
        .size,
    ).toBe(50);
    expect(new Set(hollerQuestionPrompts.map((prompt) => prompt.id)).size).toBe(
      50,
    );
    expect(
      scriptContentV1Schema.safeParse({ prompts: hollerQuestionPrompts })
        .success,
    ).toBe(true);
  });

  it("keeps evidence tags as recommendations, not prompt answers", () => {
    expect(
      hollerQuestionPrompts.every(
        (prompt) => prompt.library.targetTags.length >= 1,
      ),
    ).toBe(true);
  });
});
