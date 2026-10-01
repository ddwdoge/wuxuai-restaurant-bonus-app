/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VAPID_PUBLIC_KEY?: string;
  readonly VITE_PLATFORM_TEST_CONTROL_ENABLED?: string;
  readonly VITE_PLATFORM_TEST_CONTROL_PROJECT_REF?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
