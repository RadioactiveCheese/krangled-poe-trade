<template>
  <div class="max-w-md p-2">
    <div class="mb-2">
      <div class="flex-1 mb-1">{{ t(':language') }}</div>
      <select v-model="language" class="p-1 rounded bg-gray-700 w-24">
        <option value="en">English</option>
        <option value="ru">Русский</option>
        <option value="cmn-Hant">正體中文</option>
        <option value="ko">한국어</option>
      </select>
    </div>
    <div class="mb-2" v-if="language === 'cmn-Hant'">
      <div class="flex-1 mb-1">{{ t('realm') }}</div>
      <div class="flex gap-x-4">
        <ui-radio v-model="realm" value="pc-ggg">{{ t('realm_intl') }}</ui-radio>
        <ui-radio v-model="realm" value="pc-garena">{{ t('Hotcool') }}</ui-radio>
      </div>
    </div>
    <ui-checkbox class="mb-4" v-if="language !== 'en' && realm === 'pc-ggg'"
      v-model="useIntlSite" :disabled="forcedIntlSite"
      :class="{ 'text-gray-500': forcedIntlSite }">{{ t(':use_intl_site') }} <span class="bg-gray-200 text-gray-900 rounded px-1">www.pathofexile.com</span></ui-checkbox>
    <div class="mb-4 mt-4">
      <div class="flex-1 mb-1">{{ t(':font_size') }}</div>
      <div class="flex gap-1">
        <input v-model.number="fontSize" class="rounded bg-gray-900 px-1 block w-16 font-poe text-center" />
        <span>px</span>
      </div>
    </div>
    <div class="mb-4">
      <div class="flex-1 mb-1">Theme</div>
      <select v-model="theme" class="p-1 rounded bg-gray-700 w-56">
        <option v-for="option in themes" :key="option.value" :value="option.value">{{ option.label }}</option>
      </select>
      <div class="flex flex-wrap gap-1 mt-2">
        <button type="button" class="px-2 py-1 rounded bg-gray-700" @click="refreshThemes()">Refresh</button>
        <button type="button" class="px-2 py-1 rounded bg-gray-700" @click="openFolder">Open themes folder</button>
        <button type="button" class="px-2 py-1 rounded bg-gray-700" @click="chooseImport">Import</button>
        <button type="button" class="px-2 py-1 rounded bg-gray-700" :disabled="theme === 'default'" @click="duplicateSelected">Duplicate</button>
        <input ref="importInput" class="hidden" type="file" accept=".css,text/css" @change="importSelected">
      </div>
      <div v-if="theme.startsWith('file:')" class="text-xs text-gray-400 mt-1">
        Loaded from <span class="font-mono">{{ theme.slice('file:'.length) }}</span>.
        User files shadow shipped themes with the same name.
      </div>
      <div v-if="selectedTheme?.info?.metadata.description" class="text-xs text-gray-300 mt-1">
        {{ selectedTheme.info.metadata.description }}
        <span v-if="selectedTheme.info.metadata.author">— {{ selectedTheme.info.metadata.author }}</span>
      </div>
      <ul v-if="selectedTheme?.info?.warnings.length" class="text-xs text-yellow-400 mt-1 list-disc ml-4">
        <li v-for="warning in selectedTheme.info.warnings" :key="warning">{{ warning }}</li>
      </ul>
      <div v-if="themeMessage" :class="themeMessage.error ? 'text-red-400' : 'text-green-500'" class="text-xs mt-1">
        {{ themeMessage.text }}
      </div>
    </div>
    <ui-checkbox class="mb-4"
      v-model="restoreClipboard">{{ t(':restore_clipboard') }}</ui-checkbox>
    <div class="mb-2">
      <div class="flex-1 mb-1">{{ t(':poe_log_file') }}</div>
      <input v-model.trim="clientLog"
        class="rounded bg-gray-900 px-1 block w-full font-sans" placeholder="...?/Grinding Gear Games/Path of Exile/logs/Client.txt">
    </div>
    <div class="mb-4">
      <div class="flex-1 mb-1">{{ t(':poe_cfg_file') }}</div>
      <input v-model.trim="gameConfig"
        class="rounded bg-gray-900 px-1 block w-full font-sans" placeholder="...?/My Games/Path of Exile/production_Config.ini">
    </div>
    <hr class="mb-4 mx-8 border-gray-700">
    <div class="mb-2">
      <div class="mb-1">{{ t(':overlay_bg') }}</div>
      <div class="flex gap-4 items-baseline">
        <input v-model="overlayBackground" class="rounded bg-gray-900 px-1 block w-48 font-poe text-center" />
        <ui-radio v-model="overlayBackground" value="rgba(255, 255, 255, 0)">{{ t(':overlay_bg_none') }}</ui-radio>
      </div>
    </div>
    <ui-checkbox class="mb-2" v-if="overlayBackground !== 'rgba(255, 255, 255, 0)'"
      v-model="overlayBackgroundClose">{{ t(':overlay_bg_focus_game') }}</ui-checkbox>
    <ui-checkbox class="mb-4"
      v-model="showAttachNotification">{{ t(':show_overlay_ready') }}</ui-checkbox>
    <div class="mb-4">
      <div class="flex-1 mb-1">{{ t(':window_title') }} <span class="bg-gray-200 text-gray-900 rounded px-1">{{ t('Restart required') }}</span></div>
      <input v-model="windowTitle" class="rounded bg-gray-900 px-1 block w-full mb-1 font-poe" />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { useI18nNs } from '@/web/i18n'
import UiRadio from '@/web/ui/UiRadio.vue'
import UiCheckbox from '@/web/ui/UiCheckbox.vue'
import { configModelValue, configProp } from './utils'
import { AppConfig } from '@/web/Config'
import { DEFAULT_THEME_OPTIONS, applyTheme, duplicateTheme, importTheme, loadThemeOptions, openThemeFolder, type ThemeOption } from '@/web/theme'

export default defineComponent({
  name: 'settings.general',
  components: { UiRadio, UiCheckbox },
  props: configProp(),
  setup (props) {
    const { t } = useI18nNs('settings')

    const themes = shallowRef<ThemeOption[]>(DEFAULT_THEME_OPTIONS)
    const importInput = ref<HTMLInputElement | null>(null)
    const themeMessage = shallowRef<{ text: string, error: boolean } | null>(null)
    let refreshTimer: ReturnType<typeof setInterval> | undefined
    let themeFingerprint = ''

    async function refreshThemes (quiet = false) {
      try {
        const updated = await loadThemeOptions()
        const fingerprint = updated.map(option => `${option.value}:${option.info?.modifiedAt ?? 0}`).join('|')
        if (fingerprint !== themeFingerprint) {
          themes.value = updated
          themeFingerprint = fingerprint
          if (props.config.theme !== 'default' && !updated.some(option => option.value === props.config.theme)) {
            props.config.theme = 'default'
            await applyTheme('default')
            themeMessage.value = { text: 'The selected theme is unavailable. Default was restored.', error: true }
          } else if (props.config.theme !== 'default') {
            await applyTheme(props.config.theme)
          }
        }
        if (!quiet) themeMessage.value = { text: 'Theme list refreshed.', error: false }
      } catch (error) {
        if (!quiet) themeMessage.value = { text: (error as Error).message, error: true }
      }
    }

    onMounted(() => {
      refreshThemes(true)
      refreshTimer = setInterval(() => { refreshThemes(true) }, 2000)
    })
    onBeforeUnmount(() => clearInterval(refreshTimer))

    async function runThemeAction (action: () => Promise<{ theme: { filename: string }, warnings: string[] }>, success: string) {
      try {
        const result = await action()
        await refreshThemes(true)
        props.config.theme = `file:${result.theme.filename}`
        await applyTheme(props.config.theme)
        themeMessage.value = {
          text: result.warnings.length ? `${success} ${result.warnings.join(' ')}` : success,
          error: result.warnings.length > 0
        }
      } catch (error) {
        themeMessage.value = { text: (error as Error).message, error: true }
      }
    }

    return {
      t,
      themes,
      importInput,
      themeMessage,
      refreshThemes,
      selectedTheme: computed(() => themes.value.find(option => option.value === props.config.theme)),
      chooseImport () { importInput.value?.click() },
      async importSelected (event: Event) {
        const input = event.target as HTMLInputElement
        const file = input.files?.[0]
        if (file) await runThemeAction(() => importTheme(file), `Imported ${file.name}.`)
        input.value = ''
      },
      async duplicateSelected () {
        await runThemeAction(() => duplicateTheme(props.config.theme), 'Theme duplicated into the config folder.')
      },
      async openFolder () {
        try {
          await openThemeFolder()
          themeMessage.value = { text: 'Opened the themes folder.', error: false }
        } catch (error) {
          themeMessage.value = { text: (error as Error).message, error: true }
        }
      },
      theme: computed<typeof props.config.theme>({
        get () { return props.config.theme },
        async set (value) {
          props.config.theme = value
          if (!await applyTheme(value)) {
            props.config.theme = 'default'
            themeMessage.value = { text: 'That theme could not be loaded. Default was restored.', error: true }
          } else {
            themeMessage.value = null
          }
        }
      }),
      fontSize: configModelValue(() => props.config, 'fontSize'),
      overlayBackgroundClose: configModelValue(() => props.config, 'overlayBackgroundClose'),
      overlayBackground: configModelValue(() => props.config, 'overlayBackground'),
      clientLog: configModelValue(() => props.config, 'clientLog'),
      gameConfig: configModelValue(() => props.config, 'gameConfig'),
      language: computed<typeof props.config.language>({
        get () { return props.config.language },
        set (value) {
          props.config.language = value
          AppConfig().language = value
          if (value !== 'cmn-Hant') {
            props.config.realm = 'pc-ggg'
          }
          props.config.useIntlSite = (props.config.realm === 'pc-ggg' && value === 'cmn-Hant')
        }
      }),
      realm: computed<typeof props.config.realm>({
        get () { return props.config.realm },
        set (value) {
          props.config.realm = value
          props.config.useIntlSite = (value === 'pc-ggg' && props.config.language === 'cmn-Hant')
        }
      }),
      useIntlSite: configModelValue(() => props.config, 'useIntlSite'),
      forcedIntlSite: computed(() => props.config.realm === 'pc-ggg' && props.config.language === 'cmn-Hant'),
      restoreClipboard: configModelValue(() => props.config, 'restoreClipboard'),
      showAttachNotification: configModelValue(() => props.config, 'showAttachNotification'),
      windowTitle: configModelValue(() => props.config, 'windowTitle')
    }
  }
})
</script>
