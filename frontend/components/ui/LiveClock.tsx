'use client'

import { memo, useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const LiveClock = memo(function LiveClock() {
  const [currentTime, setCurrentTime] = useState<Date>(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex flex-col items-end">
      <span className="font-mono text-text-primary font-medium text-base tabular-nums tracking-tight">
        {format(currentTime, 'HH:mm:ss')}
      </span>
      <span className="text-xs text-text-secondary capitalize hidden sm:block">
        {format(currentTime, "EEEE, dd 'de' MMMM", { locale: ptBR })}
      </span>
    </div>
  )
})

export default LiveClock
