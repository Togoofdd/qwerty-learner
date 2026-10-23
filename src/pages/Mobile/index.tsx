import { idDictionaryMap } from '@/resources/dictionary'
import type { Word } from '@/typings'
import { wordListFetcher } from '@/utils/wordListFetcher'
import { useEffect, useRef, useState } from 'react'
import useSWR from 'swr'

const STORAGE_KEY = 'qwerty-mobile-learning-v1'
const BOOK_IDS = ['cet6', 'xinghuoqiaoji_6', 'cet6-sub', 'cet4']
type BookProgress = { index: number; wrong: string[]; reviewed: number }
type SavedState = { bookId: string; books: Record<string, BookProgress> }
type Mode = 'learn' | 'spell' | 'review'

function readSavedState(): SavedState {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && BOOK_IDS.includes(saved.bookId) && saved.books && typeof saved.books === 'object') return saved
  } catch {
    // A new or restricted browser can still open the learning screen.
  }
  return { bookId: 'cet6', books: {} }
}

export default function MobilePage() {
  const [saved, setSaved] = useState<SavedState>(readSavedState)
  const [mode, setMode] = useState<Mode>('learn')
  const [reviewQueue, setReviewQueue] = useState<string[]>([])
  const [reviewIndex, setReviewIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null)
  const [notice, setNotice] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const answerRef = useRef<HTMLInputElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const book = idDictionaryMap[saved.bookId]
  const { data, error, isLoading, mutate } = useSWR<Word[]>(book.url, async (url: string) => {
    const words = await wordListFetcher(url)
    if (!Array.isArray(words) || !words.length) throw new Error('词库加载失败')
    return words
  })
  const words = data ?? []
  const progress = saved.books[saved.bookId] ?? { index: 0, wrong: [], reviewed: 0 }
  const index = Math.max(0, Math.min(progress.index, words.length))
  const isReview = mode === 'review'
  const word = isReview ? words.find((item) => item.name === reviewQueue[reviewIndex]) : words[index]
  const finished = words.length > 0 && (isReview ? reviewIndex >= reviewQueue.length : index >= words.length)
  const primary = 'min-h-[48px] rounded-2xl bg-indigo-600 px-4 py-3 font-semibold text-white disabled:opacity-40'
  const secondary = 'min-h-[48px] rounded-2xl border border-indigo-200 bg-white px-4 py-3 font-medium text-indigo-700 dark:border-gray-600 dark:bg-gray-800 dark:text-indigo-200'

  useEffect(() => {
    setRevealed(false)
    setAnswer('')
    setResult(null)
    audioRef.current?.pause()
    setIsSpeaking(false)
  }, [saved.bookId, index, mode, reviewIndex])

  useEffect(() => () => audioRef.current?.pause(), [])

  function persist(next: SavedState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setSaved(next)
      setNotice('')
      return true
    } catch {
      setNotice('当前浏览器无法保存记录，请检查是否禁用了网站存储。进度未推进。')
      return false
    }
  }

  function updateProgress(next: BookProgress) {
    return persist({ ...saved, books: { ...saved.books, [saved.bookId]: next } })
  }

  function changeMode(next: Mode) {
    if (next === 'review') {
      setReviewQueue(progress.wrong.filter((name) => words.some((item) => item.name === name)))
      setReviewIndex(0)
    }
    setMode(next)
    setNotice('')
  }

  function complete(remembered: boolean) {
    if (!word) return
    const wrong = remembered
      ? progress.wrong.filter((name) => name !== word.name)
      : Array.from(new Set([...progress.wrong, word.name]))
    const next = {
      index: isReview ? progress.index : index + 1,
      wrong,
      reviewed: progress.reviewed + 1,
    }
    if (updateProgress(next) && isReview) setReviewIndex((value) => value + 1)
  }

  function play() {
    if (!word) return
    audioRef.current?.pause()
    const audio = new Audio('https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(word.name) + '&type=2')
    audioRef.current = audio
    setIsSpeaking(true)
    audio.onended = () => setIsSpeaking(false)
    audio.onerror = () => {
      setIsSpeaking(false)
      setNotice('发音暂时无法加载，请稍后重试。')
    }
    audio.play().catch(() => {
      setIsSpeaking(false)
      setNotice('发音未能播放，请再次点击朗读。')
    })
  }

  return (
    <main className="min-h-screen bg-indigo-50 px-4 pb-8 pt-5 text-gray-900 dark:bg-gray-900 dark:text-gray-100" style={{ minHeight: '100svh' }}>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
        <header className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-widest text-indigo-500">QWERTY LEARNER</p>
            <h1 className="mt-1 text-2xl font-bold">随时背几个单词</h1>
          </div>
          <span className="shrink-0 rounded-full bg-white px-3 py-2 text-xs text-indigo-600 dark:bg-gray-800 dark:text-indigo-200">手机版</span>
        </header>

        <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-gray-800" aria-label="词库与进度">
          <label htmlFor="mobile-book" className="mb-2 block text-sm text-gray-500 dark:text-gray-300">当前词库</label>
          <select
            id="mobile-book"
            className="min-h-[48px] w-full rounded-xl border border-gray-200 bg-white px-3 text-base text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            value={saved.bookId}
            onChange={(event) => {
              if (persist({ ...saved, bookId: event.target.value })) setMode('learn')
            }}
          >
            {BOOK_IDS.map((id) => <option key={id} value={id}>{idDictionaryMap[id].name} · {idDictionaryMap[id].length} 词</option>)}
          </select>
          <div className="mt-3 flex justify-between gap-2 text-sm">
            <span>学习进度 {index} / {words.length || book.length}</span>
            <span>错词 {progress.wrong.length}</span>
          </div>
          <progress className="mt-3 h-2 w-full accent-indigo-600" max={words.length || book.length} value={index} aria-label="学习进度" />
        </section>

        <nav className="grid grid-cols-3 gap-2" aria-label="学习方式">
          {([{ id: 'learn', label: '背单词' }, { id: 'spell', label: '默写' }, { id: 'review', label: '错词复习' }] as const).map((item) => (
            <button key={item.id} type="button" aria-pressed={mode === item.id} className={mode === item.id ? primary : secondary} onClick={() => changeMode(item.id)}>
              {item.label}
            </button>
          ))}
        </nav>

        {notice && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{notice}</p>}
        {isLoading && <p role="status" className="py-12 text-center">正在加载词库…</p>}
        {error && (
          <section role="alert" className="rounded-2xl bg-white p-6 dark:bg-gray-800">
            <p>词库未加载成功，请检查网络后重试。</p>
            <button type="button" className={secondary + ' mt-4 w-full'} onClick={() => void mutate()}>重新加载</button>
          </section>
        )}

        {!isLoading && !error && finished && (
          <section className="rounded-3xl bg-white p-6 text-center shadow-sm dark:bg-gray-800">
            <h2 className="text-2xl font-bold">{isReview ? (reviewQueue.length ? '本轮复习完成' : '暂时没有错词') : '这本词库已学完'}</h2>
            <p className="my-4 text-gray-500 dark:text-gray-300">
              {progress.wrong.length ? '还有 ' + progress.wrong.length + ' 个错词可以继续巩固。' : '每次练习都会留在当前浏览器中。'}
            </p>
            {progress.wrong.length > 0 && <button type="button" className={primary + ' w-full'} onClick={() => changeMode('review')}>复习错词</button>}
            <button type="button" className={secondary + ' mt-3 w-full'} onClick={() => {
              if (isReview) setMode('learn')
              else if (updateProgress({ ...progress, index: 0 })) setMode('learn')
            }}>{isReview ? '返回背单词' : '从头再练一遍'}</button>
          </section>
        )}

        {!isLoading && !error && word && !finished && (
          <section className="rounded-3xl bg-white p-5 shadow-sm dark:bg-gray-800" aria-label="单词练习">
            <p className="mb-5 text-sm text-gray-500 dark:text-gray-300">
              {isReview ? '错词复习 ' + (reviewIndex + 1) + ' / ' + reviewQueue.length : '第 ' + (index + 1) + ' 个单词'}
            </p>
            {mode === 'spell' ? (
              <>
                <h2 className="break-words text-xl font-semibold leading-relaxed">{word.trans.join('；')}</h2>
                <p className="mb-4 mt-2 text-sm text-gray-500 dark:text-gray-300">看释义，输入英文单词。</p>
                <form onSubmit={(event) => {
                  event.preventDefault()
                  if (!answer.trim() || result) return
                  setResult(answer.trim().toLowerCase() === word.name.toLowerCase() ? 'correct' : 'wrong')
                  setRevealed(true)
                }}>
                  <label htmlFor="mobile-answer" className="sr-only">输入英文单词</label>
                  <input
                    ref={answerRef}
                    id="mobile-answer"
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="done"
                    className="min-h-[52px] w-full rounded-xl border-2 border-indigo-200 bg-transparent px-4 text-lg outline-none focus:border-indigo-500"
                    placeholder="点击这里，输入英文"
                    value={answer}
                    readOnly={result !== null}
                    onChange={(event) => setAnswer(event.target.value)}
                  />
                  {!result && <button type="submit" disabled={!answer.trim()} className={primary + ' mt-4 w-full'}>检查拼写</button>}
                </form>
                {result && (
                  <div role="status" className="mt-4">
                    <p className={result === 'correct' ? 'font-semibold text-green-600' : 'font-semibold text-rose-600'}>{result === 'correct' ? '拼写正确！' : '还差一点，正确拼写是：'}</p>
                    <p className="my-3 break-words text-3xl font-bold" lang="en">{word.name}</p>
                    <button type="button" className={primary + ' w-full'} onClick={() => complete(result === 'correct')}>{result === 'correct' ? '下一个单词' : '加入错词并继续'}</button>
                    {result === 'wrong' && <button type="button" className={secondary + ' mt-3 w-full'} onClick={() => {
                      setResult(null)
                      setAnswer('')
                      setRevealed(false)
                      answerRef.current?.focus()
                    }}>再写一次</button>}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 className="break-words text-center text-4xl font-bold leading-tight" lang="en">{word.name}</h2>
                <p className="mt-3 break-words text-center text-sm text-gray-500 dark:text-gray-300">{word.usphone ? '/' + word.usphone + '/' : ''}</p>
                <button type="button" className={secondary + ' mt-5 w-full'} onClick={play}>{isSpeaking ? '正在朗读…' : '朗读单词'}</button>
                {revealed ? (
                  <>
                    <p className="my-6 break-words text-center text-xl leading-relaxed">{word.trans.join('；')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" className={secondary} onClick={() => complete(false)}>不认识 · 记错词</button>
                      <button type="button" className={primary} onClick={() => complete(true)}>认识 · 下一个</button>
                    </div>
                  </>
                ) : <button type="button" className={primary + ' mt-6 w-full'} onClick={() => setRevealed(true)}>查看释义</button>}
              </>
            )}
            {mode === 'spell' && !result && <button type="button" className={secondary + ' mt-3 w-full'} onClick={() => { setResult('wrong'); setRevealed(true) }}>想不起来，查看答案</button>}
            {mode === 'spell' && revealed && <button type="button" className={secondary + ' mt-3 w-full'} onClick={play}>朗读单词</button>}
          </section>
        )}

        <footer className="px-2 text-center text-xs leading-6 text-gray-500 dark:text-gray-400">
          <p>进度和错词自动保存在当前浏览器，关闭后可继续。</p>
          <p>手机学习与电脑打字练习分别记录，暂不跨设备同步。</p>
          <a className="underline" href="https://github.com/Togoofdd/qwerty-learner">Qwerty Learner · 开源项目</a>
        </footer>
      </div>
    </main>
  )
}

