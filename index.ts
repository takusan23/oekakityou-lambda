import child_process from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import { randomUUID } from 'crypto'
import path from 'path'
import { S3Event } from 'aws-lambda'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'

// "GainMap"の文字をバイト配列
const GAINMAP_TEXT_BYTE = Buffer.from('GainMap', 'utf8')

// exec() を Promise に
const exec = promisify(child_process.exec)

// S3 クライアント
const s3 = new S3Client({ region: 'ap-northeast-1' })

// 変換した画像の保存先 S3 バケット名（Lambda 環境変数）
const RESULT_S3_BACKET_NAME = process.env['S3_RESULT_BACKET_NAME']

export const handler = async (event: S3Event) => {
    const bucket = event.Records[0].s3.bucket.name
    const key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '))

    // 拡張子を取得
    const imageExtension = key.match(/\.([^.]*)$/)?.[0].toLowerCase()
    if (!imageExtension) {
        console.log('拡張子が不明です。')
        return
    }

    try {
        // S3 から追加された画像を取り出す
        const response = await s3.send(new GetObjectCommand({
            Bucket: bucket,
            Key: key
        }))
        const inputImageByteArray = await response.Body?.transformToByteArray()
        if (!inputImageByteArray) {
            console.log('S3 からデータが取得できませんでした')
            return
        }

        // 作業用フォルダをつくる
        // Lambda はインスタンス再利用されるかもなのでできればランダム
        const tempDirectory = await fs.mkdtemp('/tmp/image')

        // ImageMagick に渡すため /tmp に保存
        const inputFilePath = path.join(tempDirectory, `input${imageExtension}`)
        await fs.writeFile(inputFilePath, inputImageByteArray)

        // 変換した画像データの保存先
        // できる限りそのままの画像と、リサイズで2つ
        const originalImagePath = path.join(tempDirectory, `original${imageExtension}`)
        const resizeImagePath = path.join(tempDirectory, `resize${imageExtension}`)

        // ImageMagick でリサイズ
        // ついでに Exif に回転情報があれば画像自体を回転させて、Exif も消す（スマホの名前とか入ってる）
        if (Buffer.from(inputImageByteArray.buffer).includes(GAINMAP_TEXT_BYTE)) {
            // UltraHDR 画像の場合は uhdr: を付ける必要があるので
            await Promise.all([
                await exec(`magick -define uhdr:output-color-transfer=hlg -define uhdr:hdr-color-transfer=hlg uhdr:${inputFilePath} -auto-orient -strip uhdr:${originalImagePath}`),
                await exec(`magick -define uhdr:output-color-transfer=hlg -define uhdr:hdr-color-transfer=hlg uhdr:${inputFilePath} -auto-orient -strip -resize 50% uhdr:${resizeImagePath}`)
            ])
        } else {
            // UltraHDR じゃない
            await Promise.all([
                await exec(`magick ${inputFilePath} -auto-orient -strip ${originalImagePath}`),
                await exec(`magick ${inputFilePath} -auto-orient -strip -resize 50% ${resizeImagePath}`)
            ])
        }

        // 画像を取得
        const [originalByteArray, resizeByteArray] = await Promise.all(
            [originalImagePath, resizeImagePath]
                .map((imagePath) => fs.readFile(imagePath))
        )

        // Content-Type も付与する
        let contentType: string
        switch (imageExtension) {
            case ".jpg":
            case ".jpeg":
                contentType = 'image/jpeg'
                break
            case ".png":
                contentType = 'image/png'
                break
            default:
                // 知らない拡張子の場合は image/ をくっつけて返す
                contentType = `image/${imageExtension.replace('.', '')}`
                break
        }

        // 2つの画像で同じ UUID になるように
        // パスは /original と /resize
        const fileName = `${randomUUID()}${imageExtension}`
        const originalPut = new PutObjectCommand({
            Bucket: RESULT_S3_BACKET_NAME,
            Key: `original/${fileName}`,
            Body: originalByteArray,
            ContentType: contentType
        })
        const resizePut = new PutObjectCommand({
            Bucket: RESULT_S3_BACKET_NAME,
            Key: `resize/${fileName}`,
            Body: resizeByteArray,
            ContentType: contentType
        })

        // 出力先 S3 にアップロード
        await Promise.all([s3.send(originalPut), s3.send(resizePut)])
    } catch (error) {
        console.log(error)
    }
}