export function followTarget(said: string, screen?: { pictures?: string[]; files?: string[]; options?: number }): { kind: 'picture' | 'file'; n: number } | null;
