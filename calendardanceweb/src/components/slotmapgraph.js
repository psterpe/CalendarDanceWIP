import React, {useEffect, useCallback} from 'react';
import { DateTime } from 'luxon';
const d3 = require('d3');

export default function SlotMapGraph(props) {

    const config = {
        free: 1,
        busy: 0,
        daysAcross: 7,
        cellsPerDay: 24,
        minutesPerSlot: 30,
        colors: [
            ['#FF8A5B', '#B8BAC8'],
            ['#FF8A5B', '#CFBD95']
        ],
        width: 1000,
        height: 16,
        margin: {top: 20, right: 1, bottom: 40, left: 80}
    };

    const svg = React.createRef();

    const calcGraphParams = useCallback (() => {
        const startDate = DateTime.fromISO(props.data.startDate).set({hours:0});

        let dates = [];
        for (let d = startDate; d < startDate.plus({days: props.data.days}); d = d.plus({days: 7})) {
            dates.push(d);
            dates.push(d.plus({hours: 12}));
        }

        // props.data is an array of arrays; each inner array represents the hours of a day and
        // has 24 strings of the form 'dd' where d = 0 | 1, 1 meaning "free slot" and 0
        // meaning "busy slot."

        // Turn this into an array of arrays in which each inner array contains the values for
        // config.daysAcross consecutive days FOR JUST 12 HOURS. The inner arrays alternate. One contains
        // the slots from midnight to Noon, the next contains the slots from Noon to midnight; both are for the
        // same range of 7 days.
        let values = [];

        for (let dayIndex = 0; dayIndex < props.data.data.length; dayIndex += config.daysAcross) {
            let row1 = Array.from(props.data.data.slice(dayIndex, dayIndex+config.daysAcross).map(arr => arr.slice(0, 12)).join(',').split(',').join(''), d => parseInt(d));
            let row2 = Array.from(props.data.data.slice(dayIndex, dayIndex+config.daysAcross).map(arr => arr.slice(12, 24)).join(',').split(',').join(''), d => parseInt(d));

            values.push(row1);
            values.push(row2);
        }

        let slots = [];
        for (let i=0; i < config.cellsPerDay*config.daysAcross; i++) {
            slots.push(i);
        }

        const x = d3.scaleLinear()
            .domain([0, config.cellsPerDay*config.daysAcross])
            .range([config.margin.left, config.width - config.margin.right]);

        const innerHeight = config.height * dates.length;

        const y = d3.scaleBand()
            .domain(dates)
            .rangeRound([config.margin.top, config.margin.top + innerHeight]);

        const colorMatrix = (d, row) => config.colors[Math.floor((row/2))%2 === 1 ? 1 : 0][d];

        const xAxis = (g) => {
            g
                .call(g => g.append("g")
                    .attr("transform", `translate(0,${config.margin.top-4})`)
                    .call(d3.axisTop(x)
                        .tickValues(Array.from({ length: config.daysAcross*4}, (_, i) => i*6))
                        .tickFormat(x => {
                            if (x%24 === 0) {
                                return 'M'
                            }
                            else if (x%6 === 0) {
                                return (x%24) / 2
                            }
                        })
                        .tickSize(0))
                    .call(g => g.select(".domain").remove())
                    .call(g => g.selectAll("g.tick text").filter(function(d, i) {return d%24===0 ? this : null})
                        .style('fill', 'purple').style('font-weight', 'bold').style('font-size', '10pt').classed("day-boundary"+(props.tag || ""), true))
                    .call(g => g.append("g")
                        .attr("transform", `translate(0,${innerHeight + config.margin.top + 4})`)
                        .call(d3.axisBottom(x)
                            .tickValues(Array.from({ length: config.daysAcross*4}, (_, i) => i*6))
                            .tickFormat(x => {
                                if (x%24 === 0) {
                                    return 'M'
                                }
                                else if (x%6 === 0) {
                                    return (x%24) / 2
                                }
                            })
                            .tickSize(-innerHeight - 20))
                        .call(g => g.selectAll("g.tick text").filter(function(d, i) {return d%24===0 ? this : null})
                            .style('fill', 'purple').style('font-weight', 'bold').style('font-size', '10pt').classed("day-boundary"+(props.tag || ""), true))
                        .call(g => g.selectAll("g.tick line")
                            .attr("color", (l, i) => l % 24 === 0 ? "red" : "black")
                            .attr("stroke-width", (l, i) => l % 24 === 0 ? "2px" : "1px"))
                        .call(g => g.select(".domain").remove())))
        };

        const yAxis = (g) => {
            g
                .attr("transform", `translate(${config.margin.left},0)`)
                .call(d3.axisLeft(y)
                    .tickSize(0)
                    .tickFormat(d => {
                        if (d.hour < 12) {
                            return d3.timeFormat('%Y-%m-%d')(d);
                        }
                        else {
                            return '';
                        }
                    })
                )
                .call(g => g.select(".domain").remove())
                .call(g => g.selectAll("text").style("font-family","Consolas"));
        };

        return {
            dates: dates,
            values: values,
            slots: slots,
            innerHeight: innerHeight,
            colorMatrix: colorMatrix,
            x: x,
            y: y,
            xAxis: xAxis,
            yAxis: yAxis
        };
    }, [config.daysAcross, config.cellsPerDay, config.colors, config.height, config.margin.left, config.margin.right, config.margin.top, config.width, props.data.data, props.data.days, props.data.startDate]);

    const makeSVG = () => {
        const graphParams = calcGraphParams();
        const node = svg.current;

        d3.select(node)
            .attr("viewBox", [0, 0, config.width, graphParams.innerHeight + config.margin.top + config.margin.bottom])
            .attr("font-family", "sans-serif")
            .attr("font-size", 10);

        d3.select(node).append("g")
            .call(graphParams.xAxis);

        d3.select(node).append("g")
            .call(graphParams.yAxis);

        d3.select(node).append("g")
            .selectAll("g")
            .data(graphParams.values)
            .join("g")
            .attr("transform", (d, i) => `translate(0,${graphParams.y(graphParams.dates[i])})`)
            .attr("base-date", (d, i) => graphParams.dates[i])
            .on("mouseover", (e) => {
                const basedate = DateTime.fromISO(e.target.parentNode.getAttribute("base-date"));
                d3.selectAll("text.day-boundary"+(props.tag || "")).text((d, i) => basedate.plus({days: i}).toLocaleString({month: 'numeric', day: 'numeric'}))
            })
            .selectAll("rect")
            .data((d, i) => d.map((bit, j) => [bit, i]))
            .join("rect")
            .attr("x", (d, i) => graphParams.x(graphParams.slots[i]) + 1)
            .attr("width", (d, i) => graphParams.x(graphParams.slots[i] + 1) - graphParams.x(graphParams.slots[i]) - 1)
            .attr("height", graphParams.y.bandwidth() - 1)
            .attr("fill", (d, _) => graphParams.colorMatrix(d[0], d[1]));
    };

    useEffect(() => {
        makeSVG();
    });

    return (
        <>
            <svg ref={svg}></svg>
        </>
    )
}