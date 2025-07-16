'use client'
import React from 'react'
import { useFlags } from 'launchdarkly-react-client-sdk'
type Props = {}

export default function Flags({}: Props) {
  const { checklistFeature } = useFlags()
  return (
    <div>
      <header className='App-header' style={{ backgroundColor: checklistFeature ? '#03ba6b' : '#b3b4be' }}>
        <p>
          The checklistFeature feature flag evaluates to <b>{checklistFeature ? 'True' : 'False'}</b>
        </p>
      </header>
    </div>
  )
}
