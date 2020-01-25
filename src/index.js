import { h, app } from "hyperapp"
import * as A from "arcsecond"
import hashbow from "hashbow"

const positiveNumber = A.digits.map(parseInt)

const number = A.coroutine(function*() {
    const sign = (yield A.possibly(A.choice([ A.char("+"), A.char("-") ]))) || "+"
    const number = yield A.digits
    return parseInt(sign + number)
})

// Parse a "dice notation" string like "3d6+7"
const diceNotationParser = A.coroutine(function*() {
    const numDice = (yield A.possibly(positiveNumber)) || 1 // Optionally parse the bit before the "d" - number of dice
    const modeChar = yield A.choice([A.char("d"), A.char("u")])
    const die = yield positiveNumber // Parse the number indicating the number of sides on the simulated di(c)e
    const offset = (yield A.possibly(number)) || 0 // Optionally parse an offset - the "number" parser happens to handle positives/negatives, so it works without any extra logic
    return { numDice, die, offset }
})

const roll = ({ numDice, die, offset }) => {
    let sum = offset
    for (let i = 0; i < numDice; i++) {
        sum += Math.floor(Math.random() * die) + 1
    }
    return sum
}

const simpleDistribution = dieSize => {
    const dist = new Map()
    for (let i = 1; i <= dieSize; i++) {
        dist.set(i, 1 / dieSize)
    }
    return dist
}

const addDistributions = (x, y) => {
    const dist = new Map()
    for (const [xResult, xProbability] of x) {
        for (const [yResult, yProbability] of y) {
            const result = xResult + yResult
            dist.set(result, (dist.get(result) || 0) + (xProbability * yProbability))
        }
    }
    return dist
}

const offsetDistribution = (dist, offset) => {
    const newDist = new Map()
    for (const [result, probability] of dist) {
        newDist.set(result + offset, probability)
    }
    return newDist
}

const stats = ({ numDice, die, offset }) => {
    const lowerBound = numDice + offset
    const upperBound = numDice * die + offset
    const oneDieProbabilities = simpleDistribution(die)
    let probabilities = oneDieProbabilities
    for (let i = 1; i < numDice; i++) {
        probabilities = addDistributions(probabilities, oneDieProbabilities)
    }
    probabilities = offsetDistribution(probabilities, offset)
    return { upperBound, lowerBound, probabilities }
}

const percentage = value => `${(value * 100).toFixed(1)}%`

const renderDistribution = dist => {
    let elements = []
    let highest = 0
    for (const [_, value] of dist) {
        if (value > highest) {
            highest = value
        }
    }

    let i = 0
    for (const [result, probability] of dist) {
        const fraction = probability / highest
        elements.push(h("rect", { 
            x: i * 50, 
            y: 100 - fraction * 100, 
            width: 49, 
            height: fraction * 100, 
            style: { fill: `rgb(0, 0, ${255 * fraction})` } }, 
        [ h("title", {}, percentage(probability)) ]))

        elements.push(h("text", { x: i * 50 + 25, y: 120, width: 50, "text-anchor": "middle" }, result))
        i++
    }
    return h("svg", { height: 130, width: i * 50 + 50, class: "distribution" }, elements)
}

const rollButton = state => {
    if (state.dice === null) {
        return { ...state, rolls: [] }
    } else {
        return { ...state, rolls: [{ result: roll(state.dice), dice: state.dice }].concat(state.rolls).slice(0, 50) }
    }
}

const updateDice = (state, text) => {
    const result = diceNotationParser.run(text)
    console.log(result)
    if (result.isError) {
        return { ...state, rawDice: text, error: result.error, dice: null }
    } else {
        result.result.stats = stats(result.result)
        result.result.raw = text
        return { ...state, rawDice: text, error: null, dice: result.result }
    }
}

const renderRoll = roll => {
    const rawDice = roll.dice.raw
    return h("tr", {}, [
        h("td", { class: "raw-dice", style: { color: hashbow(rawDice) }, onClick: state => updateDice(state, rawDice) }, rawDice),
        h("td", { class: "result" }, roll.result),
        h("td", { class: "outcome-probability" }, percentage(roll.dice.stats.probabilities.get(roll.result)))
    ])
}

const onDiceInput = (state, event) => updateDice(state, event.target.value)

app({
    init: updateDice({ rolls: [] }, "d6"),
    view: state =>
      h("div", {}, [
        h("div", { class: "controls" }, [
            h("input", { type: "text", value: state.rawDice, onInput: onDiceInput }),
            h("button", { onClick: rollButton, class: "roll-button" }, "Roll"),
        ]),
        state.error !== null ? h("div", { class: "error" }, state.error) : null,
        state.dice && state.dice.stats && state.dice.stats.probabilities && renderDistribution(state.dice.stats.probabilities),
        state.rolls.length > 0 ? h("h1", {}, state.rolls[0].result) : null,
        h("table", { class: "previous-rolls" }, [
            h("tr", {}, [ h("th", {}, "Dice"), h("th", {}, "Result"), h("th", {}, "Chance") ])
        ].concat(state.rolls.map(renderRoll)))
    ]),
    node: document.getElementById("app")
})