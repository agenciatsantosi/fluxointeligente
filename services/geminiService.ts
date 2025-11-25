import { GoogleGenAI } from "@google/genai";

// NOTE: This uses the API key from environment variables.
// In a real client-side app, you'd proxy this to avoid exposing the key, 
// or require the user to input their own key.
const API_KEY = process.env.API_KEY || '';

export const generateProductDescription = async (productName: string, features: string): Promise<string> => {
  if (!API_KEY) {
    console.warn("Gemini API Key missing");
    return "Please provide an API Key to use Gemini features.";
  }

  try {
    const ai = new GoogleGenAI({ apiKey: API_KEY });
    const model = 'gemini-2.5-flash';
    
    const prompt = `
      Atue como um especialista em E-commerce e Copywriting para o Mercado Livre.
      Crie uma descrição de venda persuasiva, profissional e otimizada para SEO para o seguinte produto:
      
      Produto: ${productName}
      Características principais: ${features}
      
      Regras:
      - Use formatação em tópicos para facilitar a leitura.
      - Destaque os benefícios.
      - Inclua especificações técnicas se inferidas ou fornecidas.
      - Tom de voz: Confiável e vendedor.
      - Retorne apenas o texto da descrição.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    return response.text || "Não foi possível gerar a descrição.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Erro ao conectar com a IA para gerar descrição.";
  }
};