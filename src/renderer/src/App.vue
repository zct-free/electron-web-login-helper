<template>
  <header class="toolbar">
    <button class="btn-prepare" type="button" :disabled="preparing" @click="handlePrepare">
      {{ preparing ? "准备中…" : "打开网页" }}
    </button>
    <input
      v-model="url"
      class="url-input"
      type="text"
      placeholder="https://example.com"
      spellcheck="false"
      @keydown.enter="handlePrepare"
    />
  </header>

  <div class="action-row">
    <button
      v-if="launch"
      class="btn-launch"
      type="button"
      :title="launch.title"
      :disabled="launching"
      @click="handleLaunch"
    >
      {{ launch.label }}
    </button>
    <span
      v-if="status.text"
      class="status"
      :class="{ 'is-error': status.state === 'error', 'is-ok': status.state === 'ok' }"
    >
      {{ status.text }}
    </span>
  </div>

  <main class="panels">
    <textarea v-model="cookieText" class="panel" placeholder="cookie信息" spellcheck="false" wrap="off"></textarea>
    <textarea
      v-model="sessionText"
      class="panel"
      placeholder="sessionStorage信息"
      spellcheck="false"
      wrap="off"
    ></textarea>
    <textarea v-model="localText" class="panel" placeholder="localStorage信息" spellcheck="false" wrap="off"></textarea>
  </main>
</template>
<script setup>
import { ref } from "vue";

const url = ref("https://www.baidu.com");
const cookieText = ref("");
const sessionText = ref("");
const localText = ref("");

const preparing = ref(false);
const launching = ref(false);
const status = ref({ text: "", state: "" });
const launch = ref(null);

function setStatus(text, state = "") {
  status.value = { text, state };
}

async function handlePrepare() {
  const target = url.value.trim();
  launch.value = null;
  setStatus("");

  if (!target) {
    setStatus("请输入目标网址", "error");
    return;
  }

  preparing.value = true;

  try {
    const result = await window.api.prepare({
      url: target,
      cookie: cookieText.value,
      session: sessionText.value,
      local: localText.value,
    });

    if (!result.ok) throw new Error(result.error);

    const data = result.data;
    const injected = data.cookieCount + data.localCount + data.sessionCount;

    url.value = data.url;
    launch.value = {
      token: data.token,
      label: data.host,
      title: injected
        ? `点击打开 ${data.url} 并自动登录\n` +
          `cookie ${data.cookieCount} 条 / sessionStorage ${data.sessionCount} 项 / localStorage ${data.localCount} 项`
        : `点击打开 ${data.url}\n未填写登录信息，打开后需要手动登录`,
    };

    if (!injected) setStatus("未填写登录信息，打开后需要手动登录");
  } catch (error) {
    setStatus(error.message || "准备工作失败", "error");
  } finally {
    preparing.value = false;
  }
}

async function handleLaunch() {
  if (!launch.value || launching.value) return;

  launching.value = true;
  setStatus("正在打开…");

  try {
    const result = await window.api.openSite(launch.value.token);
    if (!result.ok) throw new Error(result.error);

    const data = result.data;
    const injected = data.cookieCount + data.localCount + data.sessionCount;

    setStatus(
      injected
        ? `已打开 ${data.host}：cookie ${data.cookieCount} 条、sessionStorage ${data.sessionCount} 项、localStorage ${data.localCount} 项已注入`
        : `已打开 ${data.host}，未注入登录信息，请手动登录`,
      injected ? "ok" : ""
    );
  } catch (error) {
    setStatus(error.message || "打开失败", "error");
  } finally {
    launching.value = false;
  }
}
</script>
