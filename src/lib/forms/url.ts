export const PUBLIC_BASE = 'https://growthexpert.com.br/f';
export const formUrl = (agency: string | null, slug: string) => (agency ? `${PUBLIC_BASE}/${agency}/${slug}` : '');
