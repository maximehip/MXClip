import select from '@inquirer/select'

export async function menu() {
    return await select({
        message: 'Select mode:',
        choices: [
            { value: 'Video' },
            { value: 'Stream' }
        ]
    })
}

export async function videoMenu() {
    return await select({
        message: 'Select video mode:',
        choices: [
            { value: 'Q&A' },
            { value: 'Clip Detection' }
        ]
    })
}

export async function languageMenu(): Promise<string> {
    return await select({
        message: 'Audio language:',
        choices: [
            { name: 'Auto-detect', value: 'auto' },
            { name: 'French (fr)', value: 'fr' },
            { name: 'English (en)', value: 'en' },
            { name: 'Spanish (es)', value: 'es' },
            { name: 'German (de)', value: 'de' },
            { name: 'Italian (it)', value: 'it' },
            { name: 'Portuguese (pt)', value: 'pt' },
            { name: 'Arabic (ar)', value: 'ar' },
            { name: 'Japanese (ja)', value: 'ja' },
            { name: 'Chinese (zh)', value: 'zh' },
        ]
    })
}

export async function streamMenu() {
    return await select({
        message: 'Select stream mode:',
        choices: [
            { value: 'Live Mode' },
            { value: 'Q&A Mode' }
        ]
    })
}
