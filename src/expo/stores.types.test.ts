import type AsyncStorageV3 from '@react-native-async-storage/async-storage';
import type AsyncStorageV2 from 'async-storage-v2';
import { describe, expectTypeOf, it } from 'vitest';
import type { AsyncStorageLike } from './stores';

describe('AsyncStorageLike', () => {
    it('accepts the default export of async-storage 2.x', () => {
        expectTypeOf<typeof AsyncStorageV2>().toExtend<AsyncStorageLike>();
    });

    it('accepts the default export of async-storage 3.x', () => {
        expectTypeOf<typeof AsyncStorageV3>().toExtend<AsyncStorageLike>();
    });
});
