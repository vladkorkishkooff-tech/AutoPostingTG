async (page) => {
  const channel = {
    id: 1,
    chat_id: '@science_test',
    title: 'Science Test',
    is_active: true,
    is_verified: true,
    bot_can_post: true,
  }
  let queue = []
  let nextId = 1
  let generation = 0
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        initData: 'browser-e2e-signed-context',
        ready() {},
        expand() {},
        isVersionAtLeast() { return true },
        HapticFeedback: {
          notificationOccurred() {},
          impactOccurred() {},
        },
      },
    }
  })
  await page.route(/telegram\.org\/js\/telegram-web-app\.js/, async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.Telegram = window.Telegram || {}; window.Telegram.WebApp = {
        initData: 'browser-e2e-signed-context',
        ready() {}, expand() {}, isVersionAtLeast() { return true },
        HapticFeedback: { notificationOccurred() {}, impactOccurred() {} }
      };`,
    })
  })

  await page.route(/\/api\/channels$/, async (route) => {
    await route.fulfill({ json: { channels: [channel] } })
  })
  await page.route(/\/api\/generate$/, async (route) => {
    const body = route.request().postDataJSON()
    generation += 1
    const makeText = (index) =>
      `🪐 Научный факт ${generation}.${index}: атмосфера Марса состоит преимущественно из углекислого газа, а давление у поверхности ниже земного.`
    if (body.action === 'preview' && Number(body.count) > 1) {
      const posts = Array.from({ length: Number(body.count) }, (_, index) => makeText(index + 1))
      await route.fulfill({ json: { posts, count: posts.length } })
      return
    }
    await route.fulfill({ json: body.action === 'preview' ? { text: makeText(1) } : { ok: true, outcome: 'published' } })
  })
  await page.route(/\/api\/history$/, async (route) => {
    await route.fulfill({ json: route.request().method() === 'GET' ? { history: [] } : { ok: true } })
  })
  await page.route(/\/api\/queue$/, async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const ids = body.texts.map((text) => {
        const id = nextId++
        queue.push({
          id,
          channel_id: 1,
          topic: body.topic,
          mode: body.mode,
          text,
          image_url: null,
          image_source: null,
          media_type: null,
          status: 'queued',
          scheduled_at: null,
          channel_title: 'Science Test',
          chat_id: '@science_test',
          error: null,
          error_code: null,
        })
        return id
      })
      await route.fulfill({ status: 201, json: { ok: true, ids, count: ids.length } })
      return
    }
    await route.fulfill({ json: { posts: queue } })
  })
  await page.route(/\/api\/queue\/\d+$/, async (route) => {
    const id = Number(route.request().url().split('/').pop())
    const body = route.request().postDataJSON()
    const post = queue.find((item) => item.id === id)
    if (body.action === 'regenerate' && post) {
      post.text = '🔬 Перегенерированный научный факт: свет в вакууме распространяется со скоростью около 300 тысяч километров в секунду.'
      post.image_url = null
      await route.fulfill({ json: { ok: true, text: post.text, photoStale: true } })
      return
    }
    if ('imageUrl' in body && post) {
      post.image_url = body.imageUrl
      post.image_source = body.imageSource
      post.media_type = body.mediaType
    }
    if (body.action === 'publish') queue = queue.filter((item) => item.id !== id)
    await route.fulfill({ json: { ok: true, outcome: body.action === 'publish' ? 'published' : undefined } })
  })
  await page.route(/\/api\/image-search$/, async (route) => {
    const candidates = ['space.png', 'galaxy.png', 'sky.png'].map((filename, index) => ({
      url: `http://127.0.0.1:3005/demo/${filename}`,
      source: `Browser test ${index + 1}`,
      title: `Mars atmosphere ${index + 1}`,
      query: 'Mars atmosphere',
      requiredTerms: ['mars', 'atmosphere'],
    }))
    await route.fulfill({ json: { ...candidates[0], candidates } })
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:3005/generator')
  await page.getByRole('combobox', { name: 'Канал публикации' }).selectOption('1')

  const batch = page.getByRole('checkbox', { name: 'Включить пакетную генерацию' })
  if (await batch.isChecked()) throw new Error('Batch must be OFF by default')
  await page.getByRole('button', { name: 'Предпросмотр' }).click()
  await page.getByText(/атмосфера Марса/).waitFor()
  await page.getByRole('button', { name: 'Стоковое фото' }).click()
  const generatorCandidates = page.getByRole('group', { name: 'Варианты стокового фото' }).getByRole('button')
  if ((await generatorCandidates.count()) !== 3) throw new Error('Expected three Generator stock candidates')
  await generatorCandidates.nth(1).click()
  await page.getByAltText('Mars atmosphere 2').first().waitFor()

  await batch.check()
  await page.getByRole('combobox', { name: 'Число черновиков' }).selectOption('4')
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: 'Сгенерировать 4 черновиков' }).click()
  await page.getByText('готово 4').waitFor()
  await page.getByRole('checkbox', { name: 'Выбрать черновик 1' }).check()
  await page.getByRole('checkbox', { name: 'Выбрать черновик 2' }).check()
  await page.getByRole('button', { name: 'Добавить выбранные в очередь (2)' }).click()
  await page.getByText('Добавлено в очередь: 2.').waitFor()

  await page.getByRole('link', { name: 'Очередь' }).click()
  await page.locator('article').first().waitFor()
  if ((await page.locator('article').count()) !== 2) throw new Error('Expected two queued batch drafts')

  const first = page.locator('article').first()
  await first.getByRole('button', { name: 'Перегенерировать текст' }).click()
  await page.getByText(/Перегенерированный научный факт/).waitFor()
  await first.getByRole('button', { name: 'Изменить медиа' }).click()
  await first.getByRole('button', { name: 'Подобрать фото' }).click()
  await first.getByRole('button', { name: /Browser test 1/ }).click()
  await first.getByAltText(/Изображение к посту/).waitFor()

  if (consoleErrors.length) throw new Error(`Browser console errors: ${consoleErrors.join(' | ')}`)
  return {
    batchDefaultOff: true,
    generatorStockCandidates: 3,
    generated: 4,
    queued: 2,
    regenerated: true,
    stockAttached: true,
  }
}
