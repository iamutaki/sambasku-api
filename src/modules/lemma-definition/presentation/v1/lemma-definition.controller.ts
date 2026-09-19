import type { Context } from 'hono';
import type { LookupLemmaDefinitionUseCase } from '../../application/use-cases/lookup-lemma-definition.use-case';

export class LemmaDefinitionController {
  constructor(private deps: { lookup: LookupLemmaDefinitionUseCase }) {}

  async lookup(c: Context, lemma: string, provider?: string) {
    const data = await this.deps.lookup.execute(lemma, provider);
    return c.json({ success: true as const, data });
  }
}
