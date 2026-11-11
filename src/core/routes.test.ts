import { describe, expect, it } from 'vitest';
import { isValidRoutePattern, normalizeRoute, routeMatches } from './routes';

const LOCALES = ['ru', 'kk'];

describe('normalizeRoute', () => {
    it.each([
        [undefined, '/'],
        [null, '/'],
        ['', '/'],
        ['   ', '/'],
        ['/', '/'],
        ['/billing?tab=2#top', '/billing'],
        ['/billing#top?x', '/billing'],
        ['/billing/', '/billing'],
        ['/billing//invoices/', '/billing/invoices'],
        ['billing', '/billing'],
        ['/ru/billing', '/billing'],
        ['/kk/billing/invoices', '/billing/invoices'],
        ['/ru', '/'],
        ['/ru/', '/'],
        ['/en/billing', '/en/billing'],
        ['/billing/ru', '/billing/ru'],
    ])('%j -> %s', (route, expected) => {
        expect(normalizeRoute(route, LOCALES)).toBe(expected);
    });

    it('strips only configured locales', () => {
        expect(normalizeRoute('/ru/billing', ['de'])).toBe('/ru/billing');
        expect(normalizeRoute('/de/billing', ['de'])).toBe('/billing');
    });
});

describe('routeMatches', () => {
    it.each([
        ['/billing', '/billing', true],
        ['/billing', '/billing/invoices', false],
        ['billing/', '/billing', true],
        ['/billing/*', '/billing', true],
        ['/billing/*', '/billing/invoices/42', true],
        ['/billing/*', '/billing-archive', false],
        ['/billing/*', '/ru/billing/invoices', true],
        ['/*', '/anything', true],
        ['*', '/anything/at/all', true],
        [' * ', '/anything', true],
        ['', '/billing', false],
    ])('%j vs %j -> %s', (pattern, route, expected) => {
        expect(routeMatches(pattern, route, LOCALES)).toBe(expected);
    });
});

describe('isValidRoutePattern', () => {
    it.each([
        ['/billing', true],
        ['/billing/*', true],
        ['*', true],
        ['/billing/*/invoices', false],
        ['/bill*ing', false],
        ['', false],
    ])('%j -> %s', (pattern, expected) => {
        expect(isValidRoutePattern(pattern)).toBe(expected);
    });
});
