import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { SettingsDialog, SettingsDialogContent } from '@browser-fs-analyzer/ui'
import { BrandButton } from '@browser-fs-analyzer/ui'

const meta: Meta<typeof SettingsDialogContent> = {
  title: 'Brand/Dialogs/Settings',
  component: SettingsDialogContent,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof SettingsDialogContent>

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(true)
    const [temperature, setTemperature] = useState(50)

    return (
      <SettingsDialog
        open={open}
        onOpenChange={setOpen}
        provider="openai"
        onProviderChange={(v) => console.log('Provider:', v)}
        apiKey=""
        onApiKeyChange={(v) => console.log('API Key:', v)}
        model="gpt-4"
        onModelChange={(v) => console.log('Model:', v)}
        temperature={temperature}
        onTemperatureChange={(v) => {
          console.log('Temperature:', v)
          setTemperature(v[0])
        }}
        maxTokens={2048}
        onMaxTokensChange={(v) => console.log('Max Tokens:', v)}
      />
    )
  },
}

export const WithTrigger: Story = {
  render: () => {
    const [open, setOpen] = useState(false)
    const [temperature, setTemperature] = useState(70)

    return (
      <>
        <BrandButton variant="primary" onClick={() => setOpen(true)}>
          打开设置
        </BrandButton>
        <SettingsDialog
          open={open}
          onOpenChange={setOpen}
          provider="anthropic"
          onProviderChange={(v) => console.log('Provider:', v)}
          apiKey=""
          onApiKeyChange={(v) => console.log('API Key:', v)}
          model="claude-3-opus"
          onModelChange={(v) => console.log('Model:', v)}
          temperature={temperature}
          onTemperatureChange={(v) => {
            console.log('Temperature:', v)
            setTemperature(v[0])
          }}
          maxTokens={4096}
          onMaxTokensChange={(v) => console.log('Max Tokens:', v)}
        />
      </>
    )
  },
}

export const DesignSpec: Story = {
  render: () => {
    const [temperature, setTemperature] = useState(50)

    return (
      <div className="flex items-center justify-center min-h-[600px] bg-gray-50">
        <SettingsDialogContent
          provider="openai"
          onProviderChange={(v) => console.log('Provider:', v)}
          apiKey=""
          onApiKeyChange={(v) => console.log('API Key:', v)}
          model="gpt-4"
          onModelChange={(v) => console.log('Model:', v)}
          temperature={temperature}
          onTemperatureChange={(v) => setTemperature(v[0])}
          maxTokens={2048}
          onMaxTokensChange={(v) => console.log('Max Tokens:', v)}
        />
      </div>
    )
  },
}
