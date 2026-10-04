import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        settings: resolve(__dirname, 'email-settings.html'),
        knowledgeCard: resolve(__dirname, 'knowledge-card.html'),
        desktopOrganizer: resolve(__dirname, 'desktop-organizer.html'),
        desktopOrganizerSettings: resolve(__dirname, 'desktop-organizer-settings.html')
      }
    }
  }
});
