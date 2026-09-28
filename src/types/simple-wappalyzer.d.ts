declare module 'simple-wappalyzer' {
  export interface WappalyzerTechnology {
    name: string;
    slug?: string;
    confidence?: number;
    version?: string | null;
    categories?: { id?: number; slug?: string; name: string }[];
  }
  export default function wappalyzer(input: { url: string; headers: Record<string, string>; html: string }): Promise<WappalyzerTechnology[]>;
}
