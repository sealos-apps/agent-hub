import {
  applyAIProxyCatalogToTemplate,
  getCatalogDefaultModelOption,
  mapAIProxyCatalogToModelOptions,
} from "./templates";
import { createTemplateFixture } from "../../test/agentFixtures";

describe("template model catalog", () => {
  it("uses the explicit catalog default model", () => {
    const template = applyAIProxyCatalogToTemplate(
      createTemplateFixture(),
      {
        region: "us",
        baseURL: "https://aiproxy.example.com/v1",
        defaultModel: "glm-4.6",
        models: [
          {
            id: "gpt-5.4-mini",
            label: "GPT-5.4 Mini",
            providerId: "aiproxy",
            providerName: "AI Proxy",
            modelType: "openai-responses",
            requestFormat: "openai-responses",
          },
          {
            id: "glm-4.6",
            label: "GLM-4.6",
            providerId: "aiproxy",
            providerName: "AI Proxy",
            modelType: "openai-chat-compatible",
            requestFormat: "openai-chat-completions",
          },
        ],
      },
    );

    expect(getCatalogDefaultModelOption(template)?.value).toBe("glm-4.6");
  });

  it("does not select the first catalog model when defaultModel is absent", () => {
    const template = applyAIProxyCatalogToTemplate(
      createTemplateFixture(),
      {
        region: "us",
        baseURL: "https://aiproxy.example.com/v1",
        models: [
          {
            id: "gpt-5.4-mini",
            label: "GPT-5.4 Mini",
            providerId: "aiproxy",
            providerName: "AI Proxy",
            modelType: "openai-responses",
            requestFormat: "openai-responses",
          },
        ],
      },
    );

    expect(getCatalogDefaultModelOption(template)).toBeNull();
  });

  it("maps AI Proxy request format into UI metadata without changing provider id", () => {
    const options = mapAIProxyCatalogToModelOptions({
      region: "us",
      baseURL: "https://aiproxy.example.com/v1",
      defaultModel: "gpt-5.4",
      models: [
        {
          id: "gpt-5.4",
          label: "GPT-5.4",
          providerId: "aiproxy",
          providerName: "AI Proxy",
          modelType: "openai-responses",
          requestFormat: "openai-responses",
        },
      ],
    });

    expect(options).toEqual([
      {
        value: "gpt-5.4",
        label: "GPT-5.4",
        helper: "AI Proxy · openai-responses",
        provider: "aiproxy",
        apiMode: "openai-responses",
      },
    ]);
  });
});
