import { getEmbedding } from "./embedding";
import { EmbeddedEvent } from "./types/EmbeddedEvent";

function cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
}

 export async function searchSimilar(query: string, events: EmbeddedEvent[], topK: number): Promise<EmbeddedEvent[]> {
     const queryEmbedding = await getEmbedding(query);
     const similarities = events.map((event, index) => ({
         index,
         similarity: cosineSimilarity(queryEmbedding, event.embedding)
     }));
     return similarities
         .sort((a, b) => b.similarity - a.similarity)
         .slice(0, topK)
         .map(item => events[item.index]);
 }