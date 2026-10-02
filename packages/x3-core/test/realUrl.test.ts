import { describe, expect, it } from 'vitest';
import { applyPageRules, DEFAULT_PAGE_RULES } from '../src/page/rules';

// Real URL captured by the user on X3 Cloud (snouestboissons.em.cloud-by-sage.fr), function GESBPC, 2026-10-02.
const REAL_URL =
  'https://snouestboissons.em.cloud-by-sage.fr/syracuse-main/html/main.html?url=%2Ftrans%2Fx3%2Ferp%2FPREPROD%2F%24sessions%3Ff%3DGESBPC%252F2%252F%252FM%252F%26profile%3D~(loc~%27fr-FR~role~%276425f858-2cc0-4541-91e1-ca5584c37cae~ep~%2748f1ce9f-2458-46d1-bfd6-6ca9526175cc~appConn~())';
const REAL_TITLE = 'Client (Super administrateur) (Pré-Prod)';

describe('default page rules on a real X3 Cloud URL', () => {
  it('detects X3, folder and function', () => {
    const r = applyPageRules(REAL_URL, REAL_TITLE, DEFAULT_PAGE_RULES);
    expect(r.marksX3?.ruleId).toBe('syracuse-main-path');
    expect(r.values.dataset?.value).toBe('PREPROD');
    expect(r.values.folder).toBeUndefined(); // the server folder is not in the URL
    expect(r.values.function?.value).toBe('GESBPC');
    expect(r.values.dataset?.status).toBe('verified');
    expect(r.values.function?.status).toBe('verified');
  });
});
