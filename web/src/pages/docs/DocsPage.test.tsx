import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DocsPage } from './DocsPage'

const userIndex = {
  title: '用户文档',
  pages: [
    {
      slug: 'getting-started',
      title: '快速入门',
      file: 'getting-started.md',
      order: 1,
    },
  ],
}

const developerIndex = {
  title: '开发者文档',
  pages: [
    {
      slug: 'guides-quick-start',
      title: '快速入门',
      file: 'guides/quick-start.md',
      category: 'guides',
      order: 101,
    },
  ],
}

describe('DocsPage sidebar grouping', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url

      if (url === '/docs/user/_index.json') {
        return Promise.resolve(new Response(JSON.stringify(userIndex), { status: 200 }))
      }

      if (url === '/docs/developer/_index.json') {
        return Promise.resolve(new Response(JSON.stringify(developerIndex), { status: 200 }))
      }

      return Promise.resolve(new Response('Not found', { status: 404 }))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders user docs without group headers', async () => {
    render(<DocsPage category="user" />)

    const entries = await screen.findAllByText('快速入门')
    expect(entries.length).toBeGreaterThan(0)
    expect(screen.queryByText('使用指南')).not.toBeInTheDocument()
  })

  it('renders developer docs without group headers', async () => {
    render(<DocsPage category="developer" />)

    const entries = await screen.findAllByText('快速入门')
    expect(entries.length).toBeGreaterThan(0)
    expect(screen.queryByText('开发指南')).not.toBeInTheDocument()
    expect(screen.queryByText('Guides')).not.toBeInTheDocument()
  })
})
