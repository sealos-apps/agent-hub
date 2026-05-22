import { cn } from '../../lib/format'

interface SliderOption {
  label: string
  value: number
}

interface SliderProps {
  className?: string
  label: string
  onChange: (value: number) => void
  options: SliderOption[]
  unit: string
  value: number
}

function resolveNearestIndex(value: number, options: SliderOption[]) {
  if (!options.length) return 0
  const exactIndex = options.findIndex((option) => option.value === value)
  if (exactIndex >= 0) return exactIndex

  return options.reduce((closestIndex, option, index) => {
    const currentDistance = Math.abs(option.value - value)
    const closestDistance = Math.abs(options[closestIndex].value - value)
    return currentDistance < closestDistance ? index : closestIndex
  }, 0)
}

export function Slider({
  className,
  label,
  onChange,
  options,
  unit,
  value,
}: SliderProps) {
  const activeIndex = resolveNearestIndex(value, options)
  const maxIndex = Math.max(options.length - 1, 1)
  const progress = `${(activeIndex / maxIndex) * 100}%`
  const activeOption = options[activeIndex] || options[0]

  return (
    <div className={cn('flex items-start gap-6 lg:gap-10', className)}>
      <div className="flex h-10 w-[60px] shrink-0 items-center text-sm font-medium text-zinc-900">
        {label}
      </div>

      <div className="flex min-w-0 flex-1 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="relative pt-1">
            <div className="h-1.5 w-full rounded-full bg-zinc-100" />
            <div
              className="absolute left-0 top-1 h-1.5 rounded-full bg-zinc-900"
              style={{ width: progress }}
            />
            <div
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-900 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
              style={{ left: progress }}
            />
            <input
              aria-label={label}
              className="absolute inset-0 z-10 h-4 w-full cursor-pointer appearance-none bg-transparent opacity-0"
              max={maxIndex}
              min={0}
              onChange={(event) => {
                const nextIndex = Number(event.target.value)
                const nextOption = options[nextIndex] || activeOption
                onChange(nextOption.value)
              }}
              step={1}
              type="range"
              value={activeIndex}
            />
          </div>

          <div className="mt-3 flex items-center justify-between text-[14px]/5 text-zinc-500">
            {options.map((option) => (
              <span key={option.value}>{option.label}</span>
            ))}
          </div>
        </div>

        <div className="pt-4 text-sm text-zinc-500">{unit}</div>
      </div>
    </div>
  )
}
