export function isNotFound(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
}
