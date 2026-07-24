// Augment the existing DOM types instead of creating new ones
declare global {
    interface FileSystemFileHandle {
        createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>
    }

    interface FileSystemSyncAccessHandle {
        write(buffer: BufferSource, options?: { at?: number }): number
        read(buffer: BufferSource, options?: { at?: number }): number
        getSize(): number
        truncate(newSize: number): void
        flush(): void
        close(): void
    }

    interface Navigator {
        readonly storage: StorageManager
    }

    interface StorageManager {
        getDirectory(): Promise<FileSystemDirectoryHandle>
    }
}

export {}