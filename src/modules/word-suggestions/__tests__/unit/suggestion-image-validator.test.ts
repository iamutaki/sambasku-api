import { describe, expect, it } from 'vitest';
import { createSuggestionSchema } from '../../presentation/v1/validators/suggestion.validator';

describe('createSuggestionSchema images', () => {
  it('menerima provider imagekit pada action=add', () => {
    const parsed = createSuggestionSchema.safeParse({
      reason_code: 'image_issue',
      proposed_changes: {
        images: [
          {
            action: 'add',
            url: 'https://ik.imagekit.io/demo/words/a.jpg',
            provider: 'imagekit',
            provider_file_id: 'file_abc',
            is_primary: false,
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('menerima stock pexels', () => {
    const parsed = createSuggestionSchema.safeParse({
      reason_code: 'image_issue',
      proposed_changes: {
        images: [
          {
            action: 'add',
            url: 'https://images.pexels.com/photos/1/food.jpg',
            provider: 'pexels',
            provider_file_id: 'pexels-1',
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
  });
});
