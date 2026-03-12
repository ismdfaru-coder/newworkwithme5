import { generateText, Output } from 'ai'
import { z } from 'zod'

const slideSchema = z.object({
  slides: z.array(z.object({
    title: z.string().describe('The title of the slide'),
    content: z.array(z.string()).describe('Array of bullet points or key information for this slide'),
  })).describe('Array of slides for the presentation'),
})

export async function POST(req: Request) {
  const { topic, audience, slideCount, style } = await req.json()

  const prompt = `You are an expert presentation creator and researcher. Create a ${slideCount}-slide presentation about "${topic}".

Target audience: ${audience || 'general audience'}
Style: ${style || 'professional'}

IMPORTANT INSTRUCTIONS:
1. First, research and gather key information about the topic
2. Identify the most important points, facts, statistics, and insights
3. Structure the presentation logically with a clear flow
4. Include specific data, examples, and actionable insights where relevant
5. Make each slide focused and impactful

The presentation should include:
- Slide 1: Title slide with topic and subtitle
- Slides 2-${parseInt(slideCount) - 1}: Main content slides with key points, research findings, and insights
- Slide ${slideCount}: Conclusion/Thank you slide with key takeaways

For each bullet point, provide substantive content - not generic placeholders. Include real facts, statistics, best practices, or actionable information where applicable.`

  try {
    const { output } = await generateText({
      model: 'openai/gpt-5-mini',
      output: Output.object({
        schema: slideSchema,
      }),
      prompt,
      maxOutputTokens: 4000,
      temperature: 0.7,
    })

    if (!output || !output.slides) {
      throw new Error('Failed to generate slides')
    }

    return Response.json({ slides: output.slides })
  } catch (error) {
    console.error('Error generating slides:', error)
    return Response.json(
      { error: 'Failed to generate slides. Please try again.' },
      { status: 500 }
    )
  }
}
